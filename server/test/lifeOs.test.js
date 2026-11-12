const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const env = require('../src/config/env');
const {
  redactPII,
  withRetry,
  validateGoalInput,
  seedRestaurantDemo,
  updateMilestoneStatus,
  runSourcingAgent,
  selectQuote,
  runNegotiationAgent,
  decideApproval,
  runExecutionMonitor,
  preparePayPalPayment
} = require('../src/services/lifeOsService');

const app = createApp();

test('redactPII removes emails, phone numbers, and API keys before LLM prompts', () => {
  const raw = 'Contact owner@bistro.in or +91 9876543210 using key sk-abc1234567890xyz';
  const safe = redactPII(raw);
  assert.equal(safe.includes('owner@bistro.in'), false);
  assert.equal(safe.includes('9876543210'), false);
  assert.equal(safe.includes('sk-abc1234567890xyz'), false);
  assert.ok(safe.includes('[REDACTED_EMAIL]'));
});

test('withRetry retries transient failures and succeeds within retry budget', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('Transient 503');
    return 'ok';
  }, { retries: 2, baseDelayMs: 10 });
  assert.equal(result.value, 'ok');
  assert.equal(result.attempts, 3);
  assert.equal(result.retriesUsed, 2);
});

test('validateGoalInput enforces valid title, positive budget, and valid deadline', () => {
  assert.throws(() => validateGoalInput({ title: 'Hi', totalBudget: 5000 }), /at least 5 characters/);
  assert.throws(() => validateGoalInput({ title: 'Valid Goal Title', totalBudget: -10 }), /valid positive number/);
  const ok = validateGoalInput({ title: 'Open a micro bakery', totalBudget: 250000, country: 'IN', currency: 'INR' });
  assert.equal(ok.currency, 'INR');
  assert.equal(ok.totalBudget, 250000);
});

test('Restaurant Demo orchestrates dependencies, sourcing, negotiation, human approvals, and payment prep', async () => {
  const demo = await seedRestaurantDemo('OWNER');
  const id = demo._id || demo.goalRef;
  assert.match(demo.title, /Launch a small restaurant/i);
  assert.equal(demo.milestones.length, 5);
  assert.ok(demo.approvals.length >= 3);

  // Dependency enforcement: M2 cannot complete before M1
  await assert.rejects(() => updateMilestoneStatus(id, 'M2', 'COMPLETED', 'OPERATOR'), /Dependency blocked/);

  // Complete M1 first, then M2 can start
  await updateMilestoneStatus(id, 'M1', 'COMPLETED', 'OPERATOR');
  const afterM2Start = await updateMilestoneStatus(id, 'M2', 'IN_PROGRESS', 'OPERATOR');
  assert.equal(afterM2Start.milestones.find((m) => m.code === 'M2').status, 'IN_PROGRESS');

  // Mock live search to verify real vs simulated quote distinction
  const sourced = await runSourcingAgent(id, 'M2', 'OPERATOR', {
    searchFn: async (q) => ({
      items: [{
        name: `Live Offer for ${q}`,
        store: 'KitchenMart',
        source: 'GOOGLE_SHOPPING',
        price: 45000,
        currency: 'INR',
        url: 'https://example.com/item'
      }],
      sourceInfo: { mode: 'LIVE' },
      errors: []
    })
  });
  assert.ok(sourced.providerSummary.liveHits >= 1);
  const liveQuote = sourced.goal.quotes.find((q) => q.isRealProvider && q.milestoneCode === 'M2');
  assert.ok(liveQuote);

  // Negotiation Copilot drafts script & ensures PROVIDER_OUTREACH approval
  const neg = await runNegotiationAgent(id, liveQuote.quoteId, 'OPERATOR');
  assert.ok(neg.script.length > 20);

  // Select quote -> creates PURCHASE_COMMITMENT approval
  const selected = await selectQuote(id, liveQuote.quoteId, 'OPERATOR');
  const payApr = selected.approvals.find((a) => a.type === 'PAYMENT_AUTHORIZATION');
  assert.ok(payApr);

  // Unapproved payment prep must fail (409)
  await assert.rejects(() => preparePayPalPayment(id, payApr.approvalId, { createSandboxOrder: false }, 'OWNER'), /Human approval is required/);

  // Approve PAYMENT_AUTHORIZATION -> Payment Prep succeeds
  await decideApproval(id, payApr.approvalId, { decision: 'APPROVED', note: 'Approved in test' }, 'OWNER');
  const staged = await preparePayPalPayment(id, payApr.approvalId, { createSandboxOrder: false }, 'OWNER');
  assert.ok(staged.stagedCheckout.amount > 0 && staged.stagedCheckout.amount <= 5000);
  assert.equal(staged.transaction.sandboxOnly, true);

  // Execution monitor runs cleanly
  const mon = await runExecutionMonitor(id, 'OPERATOR');
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(mon.monitor.riskLevel));
});

test('Life OS API enforces RBAC roles and Admin Key on sensitive approval/payment routes', async () => {
  await request(app).get('/api/life-os/status').expect(200);

  // VIEWER cannot create goals or seed demo
  await request(app)
    .post('/api/life-os/demo/restaurant')
    .set('X-Life-Role', 'VIEWER')
    .expect(403);

  // Approval decision without X-Admin-Key must fail with 401
  await request(app)
    .post('/api/life-os/goals/LIFE-NONEXISTENT/approvals/APR-1/decide')
    .set('X-Life-Role', 'OWNER')
    .send({ decision: 'APPROVED' })
    .expect(401);

  // Payment preparation with wrong X-Admin-Key must fail with 401
  await request(app)
    .post('/api/life-os/goals/LIFE-NONEXISTENT/payments/prepare')
    .set('X-Life-Role', 'OWNER')
    .set('X-Admin-Key', 'wrong-key')
    .send({ approvalId: 'APR-1' })
    .expect(401);

  // Valid OWNER + valid Admin Key passes RBAC/Auth middleware and hits 404 for nonexistent goal
  if (env.adminApiKey && env.adminApiKey.length >= 24) {
    await request(app)
      .post('/api/life-os/goals/LIFE-NONEXISTENT/approvals/APR-1/decide')
      .set('X-Life-Role', 'OWNER')
      .set('X-Admin-Key', env.adminApiKey)
      .send({ decision: 'APPROVED' })
      .expect(404);
  }
});
