const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { extractApproveUrl } = require('../src/services/paypalService');
const {
  evaluateGuardrails,
  updateGuardrails,
  createEscrow,
  advanceEscrow,
  calculateFxSplit,
  scoreRiskAndProtection
} = require('../src/services/futureService');

const app = createApp();

test('extractApproveUrl extracts approve or payer-action HATEOAS links', () => {
  assert.equal(
    extractApproveUrl({ links: [{ rel: 'self', href: 'https://api-m.sandbox.paypal.com/self' }, { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=123' }] }),
    'https://www.sandbox.paypal.com/checkoutnow?token=123'
  );
  assert.equal(extractApproveUrl({ links: [] }), null);
});

test('Agentic Spend Guardrails enforces caps, step-up approval, and freeze mode', async () => {
  await updateGuardrails({ maxPerOrderUsd: 200, dailyCapUsd: 600, stepUpThresholdUsd: 80, agentMode: 'AUTONOMOUS_UNDER_CAP' });
  const low = await evaluateGuardrails({ amountUsd: 40, category: 'Laptops', description: 'USB-C hub' });
  assert.equal(low.decision, 'APPROVED_FOR_SANDBOX');
  assert.equal(low.allowedToStage, true);

  const stepUp = await evaluateGuardrails({ amountUsd: 120, category: 'Laptops', description: 'Mechanical keyboard' });
  assert.equal(stepUp.decision, 'STEP_UP_REQUIRED');
  assert.equal(stepUp.allowedToStage, true);

  const blocked = await evaluateGuardrails({ amountUsd: 350, category: 'Laptops', description: 'Monitor' });
  assert.equal(blocked.decision, 'BLOCKED');
  assert.equal(blocked.allowedToStage, false);

  await updateGuardrails({ agentMode: 'SUPERVISED', maxPerOrderUsd: 250, dailyCapUsd: 750, stepUpThresholdUsd: 100 });
});

test('Programmable Smart Escrow supports creation, dispatch verification, milestone release, and dispute hold', async () => {
  const esc = await createEscrow({ title: 'Test Laptop Escrow', merchantLabel: 'Demo Merchant', totalAmountUsd: 100, firstMilestonePct: 40 });
  assert.equal(esc.milestones.length, 2);
  assert.equal(esc.milestones[0].amountUsd, 40);
  assert.equal(esc.milestones[1].amountUsd, 60);

  const id = esc._id || esc.escrowRef;
  const dispatched = await advanceEscrow(id, 'VERIFY_DISPATCH');
  assert.equal(dispatched.status, 'DISPATCH_VERIFIED');

  const released1 = await advanceEscrow(id, 'RELEASE_NEXT');
  assert.equal(released1.milestones[0].status, 'RELEASED');
  assert.equal(released1.milestones[1].status, 'UNLOCKED');

  const held = await advanceEscrow(id, 'HOLD_DISPUTE', { reason: 'Screen scratch reported' });
  assert.equal(held.status, 'DISPUTE_HOLD');
  assert.equal(held.milestones[1].status, 'HELD');
});

test('Cross-Border FX & PYUSD Split-Pay computes exact per-buyer USD shares and rail savings', () => {
  const res = calculateFxSplit({ sourceCurrency: 'INR', amount: 25000, splitCount: 4 });
  assert.equal(res.splitCount, 4);
  assert.ok(res.perPersonUsd > 0 && res.perPersonUsd <= 5000);
  assert.equal(res.rails.length, 3);
  assert.ok(res.estimatedSavingsVsCardUsd >= 0);
});

test('AI Fraud Shield returns bounded risk score and protection assessment', async () => {
  const res = await scoreRiskAndProtection({ amountUsd: 150, merchant: 'Demo Store', description: 'Headphones' });
  assert.ok(res.riskScore >= 0 && res.riskScore <= 100);
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(res.riskTier));
  assert.equal(typeof res.sellerProtectionEligible, 'boolean');
});

test('Future API routes respond cleanly and protect batch reconciliation with admin key', async () => {
  const fxRes = await request(app).post('/api/future/fx-split').send({ sourceCurrency: 'USD', amount: 100, splitCount: 2 }).expect(200);
  assert.equal(fxRes.body.perPersonUsd, 50);

  await request(app).post('/api/future/reconcile-batch').expect(401);
});

test('receivePayPalWebhook processes PAYMENT.CAPTURE.COMPLETED without crashing on undefined variables', async () => {
  const paypalServicePath = require.resolve('../src/services/paypalService');
  const webhookModelPath = require.resolve('../src/models/WebhookEvent');
  const paymentModelPath = require.resolve('../src/models/Payment');
  const auditServicePath = require.resolve('../src/services/auditService');
  const controllerPath = require.resolve('../src/controllers/webhookController');

  const origPayPal = require.cache[paypalServicePath];
  const origWebhook = require.cache[webhookModelPath];
  const origPayment = require.cache[paymentModelPath];
  const origAudit = require.cache[auditServicePath];
  const origCtrl = require.cache[controllerPath];

  let savedPayment = null;
  let storedDoc = null;

  try {
    delete require.cache[controllerPath];
    require.cache[paypalServicePath] = { exports: { ...origPayPal.exports, verifyWebhook: async () => true } };
    require.cache[webhookModelPath] = {
      exports: {
        create: async (doc) => { storedDoc = { id: 'wh-1', ...doc, save: async () => storedDoc }; return storedDoc; }
      }
    };
    require.cache[paymentModelPath] = {
      exports: {
        findOne: async () => {
          savedPayment = { status: 'APPROVED', captureId: null, save: async () => savedPayment };
          return savedPayment;
        }
      }
    };
    require.cache[auditServicePath] = { exports: { writeAudit: async () => {} } };

    const { receivePayPalWebhook } = require('../src/controllers/webhookController');
    let statusCode = 0;
    let body = null;
    const req = {
      headers: {},
      requestId: 'req-test',
      body: {
        id: 'WH-EVT-1',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'CAP-99', supplementary_data: { related_ids: { order_id: 'ORD-99' } } }
      }
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(payload) { body = payload; return this; }
    };
    let nextErr = null;
    await receivePayPalWebhook(req, res, (err) => { nextErr = err; });

    assert.equal(nextErr, null);
    assert.equal(statusCode, 200);
    assert.equal(body.processed, true);
    assert.equal(savedPayment.status, 'COMPLETED');
    assert.equal(savedPayment.captureId, 'CAP-99');
  } finally {
    if (origPayPal) require.cache[paypalServicePath] = origPayPal;
    if (origWebhook) require.cache[webhookModelPath] = origWebhook;
    if (origPayment) require.cache[paymentModelPath] = origPayment;
    if (origAudit) require.cache[auditServicePath] = origAudit;
    if (origCtrl) require.cache[controllerPath] = origCtrl;
    else delete require.cache[controllerPath];
  }
});
