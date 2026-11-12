const crypto = require('node:crypto');
const mongoose = require('mongoose');
const AgentPolicy = require('../models/AgentPolicy');
const EscrowContract = require('../models/EscrowContract');
const Payment = require('../models/Payment');
const WebhookEvent = require('../models/WebhookEvent');
const env = require('../config/env');
const { getOrder, extractApproveUrl } = require('./paypalService');
const { statusFromOrder, captureFromOrder } = require('./paymentState');
const { upsertPaymentIncident } = require('./incidentService');
const { writeAudit } = require('./auditService');

const FX_TO_USD = {
  USD: 1,
  INR: 0.0118, // Indicative ~84.75 INR per USD (Sandbox demo rate)
  GBP: 1.285   // Indicative GBP per USD (Sandbox demo rate)
};

let memoryPolicy = {
  policyKey: 'default-workspace',
  maxPerOrderUsd: 250,
  dailyCapUsd: 750,
  stepUpThresholdUsd: 100,
  agentMode: 'SUPERVISED',
  autoPauseOnAnomaly: true,
  allowedCategories: ['Laptops', 'Phones', 'Audio', 'Accessories', 'Monitors', 'Products', 'Software']
};

const memoryEscrows = [
  {
    _id: 'DEMO-ESC-1',
    escrowRef: 'ESC-PYPL-9042',
    title: 'Refurbished ThinkPad X1 Carbon · Milestone Escrow',
    buyerLabel: 'PayPulse Buyer',
    merchantLabel: 'Certified Tech Reseller',
    totalAmountUsd: 145.00,
    currency: 'USD',
    paypalOrderId: null,
    paypalStatus: 'UNLINKED',
    status: 'DISPATCH_VERIFIED',
    milestones: [
      { id: 'm1', label: 'Dispatch & tracking verified', percent: 40, amountUsd: 58.00, condition: 'Carrier scan confirmed', status: 'RELEASED', releasedAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'm2', label: '48h inspection & zero-dispute window', percent: 60, amountUsd: 87.00, condition: 'Buyer confirms condition matches listing', status: 'UNLOCKED' }
    ],
    auditTrail: [
      { at: new Date(Date.now() - 86400000).toISOString(), event: 'CREATED', detail: 'Programmable 40/60 milestone contract initialized.' },
      { at: new Date(Date.now() - 43200000).toISOString(), event: 'DISPATCH_VERIFIED', detail: 'Milestone 1 unlocked and marked ready for settlement.' }
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString()
  }
];

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

function roundMoney(v) {
  return Number(Number(v || 0).toFixed(2));
}

// 1. Agentic Spend Guardrails
async function getGuardrails() {
  if (!isDbReady()) return { ...memoryPolicy };
  let doc = await AgentPolicy.findOne({ policyKey: 'default-workspace' }).lean();
  if (!doc) {
    doc = (await AgentPolicy.create({ policyKey: 'default-workspace' })).toObject();
  }
  return doc;
}

async function updateGuardrails(patch = {}) {
  const allowedModes = ['SUPERVISED', 'AUTONOMOUS_UNDER_CAP', 'FROZEN'];
  const update = {};
  if (patch.maxPerOrderUsd !== undefined) update.maxPerOrderUsd = Math.min(5000, Math.max(1, Number(patch.maxPerOrderUsd) || 250));
  if (patch.dailyCapUsd !== undefined) update.dailyCapUsd = Math.min(20000, Math.max(1, Number(patch.dailyCapUsd) || 750));
  if (patch.stepUpThresholdUsd !== undefined) update.stepUpThresholdUsd = Math.min(5000, Math.max(1, Number(patch.stepUpThresholdUsd) || 100));
  if (patch.agentMode && allowedModes.includes(String(patch.agentMode).toUpperCase())) {
    update.agentMode = String(patch.agentMode).toUpperCase();
  }
  if (patch.autoPauseOnAnomaly !== undefined) update.autoPauseOnAnomaly = Boolean(patch.autoPauseOnAnomaly);
  if (Array.isArray(patch.allowedCategories)) {
    update.allowedCategories = patch.allowedCategories.map((c) => String(c).trim()).filter(Boolean).slice(0, 15);
  }

  if (!isDbReady()) {
    memoryPolicy = { ...memoryPolicy, ...update };
    return { ...memoryPolicy };
  }
  return AgentPolicy.findOneAndUpdate(
    { policyKey: 'default-workspace' },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

async function getDailyPayPalSpendUsd() {
  if (!isDbReady()) return 0;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const agg = await Payment.aggregate([
    { $match: { source: 'PAYPAL', status: { $in: ['COMPLETED', 'APPROVED', 'PENDING'] }, createdAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return roundMoney(agg[0]?.total || 0);
}

async function evaluateGuardrails(input = {}) {
  const policy = await getGuardrails();
  const amountUsd = roundMoney(input.amountUsd);
  const category = String(input.category || 'Products').trim();
  const merchant = String(input.merchant || 'Merchant').trim().slice(0, 80);
  const description = String(input.description || 'Agentic PayPal checkout').trim().slice(0, 120);

  if (!Number.isFinite(amountUsd) || amountUsd < 0.01 || amountUsd > 5000) {
    const err = new Error('Proposed Sandbox amount must be between $0.01 and $5,000.00 USD.');
    err.status = 400;
    throw err;
  }

  const dailySpentUsd = await getDailyPayPalSpendUsd();
  const projectedDailyUsd = roundMoney(dailySpentUsd + amountUsd);
  const remainingCapUsd = roundMoney(Math.max(0, policy.dailyCapUsd - dailySpentUsd));
  const riskFlags = [];

  if (policy.agentMode === 'FROZEN') {
    riskFlags.push('Agentic wallet is currently FROZEN by user policy.');
  }
  if (amountUsd > policy.maxPerOrderUsd) {
    riskFlags.push(`Order ($${amountUsd}) exceeds max per-order guardrail ($${policy.maxPerOrderUsd}).`);
  }
  if (projectedDailyUsd > policy.dailyCapUsd) {
    riskFlags.push(`Projected 24h spend ($${projectedDailyUsd}) exceeds daily cap ($${policy.dailyCapUsd}).`);
  }
  const categoryAllowed = !policy.allowedCategories?.length
    || policy.allowedCategories.some((c) => c.toLowerCase() === category.toLowerCase());
  if (!categoryAllowed) {
    riskFlags.push(`Category "${category}" is outside allowed merchant categories.`);
  }

  let decision = 'APPROVED_FOR_SANDBOX';
  if (policy.agentMode === 'FROZEN' || amountUsd > policy.maxPerOrderUsd || projectedDailyUsd > policy.dailyCapUsd || !categoryAllowed) {
    decision = 'BLOCKED';
  } else if (policy.agentMode === 'SUPERVISED' || amountUsd >= policy.stepUpThresholdUsd) {
    decision = 'STEP_UP_REQUIRED';
    riskFlags.push(
      policy.agentMode === 'SUPERVISED'
        ? 'Supervised mode requires human PayPal Sandbox approval before capture.'
        : `Amount meets step-up threshold ($${policy.stepUpThresholdUsd}); PayPal passkey/login approval required.`
    );
  }

  return {
    decision,
    allowedToStage: decision !== 'BLOCKED',
    amountUsd,
    merchant,
    category,
    description,
    dailySpentUsd,
    projectedDailyUsd,
    remainingCapUsd,
    riskFlags,
    policySnapshot: {
      maxPerOrderUsd: policy.maxPerOrderUsd,
      dailyCapUsd: policy.dailyCapUsd,
      stepUpThresholdUsd: policy.stepUpThresholdUsd,
      agentMode: policy.agentMode
    }
  };
}

// 2. Programmable Smart Escrow & Milestone Settlement
async function listEscrows() {
  if (!isDbReady()) return memoryEscrows;
  const docs = await EscrowContract.find().sort({ createdAt: -1 }).limit(30).lean();
  return docs.length ? docs : memoryEscrows;
}

async function createEscrow(body = {}) {
  const title = String(body.title || '').trim().slice(0, 120);
  const merchantLabel = String(body.merchantLabel || 'Verified Sandbox Merchant').trim().slice(0, 80);
  const totalAmountUsd = roundMoney(body.totalAmountUsd);
  const firstPct = Math.min(90, Math.max(10, Number(body.firstMilestonePct) || 40));
  const secondPct = 100 - firstPct;

  if (title.length < 3 || !Number.isFinite(totalAmountUsd) || totalAmountUsd < 1 || totalAmountUsd > 5000) {
    const err = new Error('Enter an escrow title (min 3 chars) and USD amount between $1.00 and $5,000.00.');
    err.status = 400;
    throw err;
  }

  const m1Amount = roundMoney((totalAmountUsd * firstPct) / 100);
  const m2Amount = roundMoney(totalAmountUsd - m1Amount);
  const escrowRef = `ESC-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;

  const payload = {
    escrowRef,
    title,
    buyerLabel: String(body.buyerLabel || 'PayPulse Buyer').slice(0, 60),
    merchantLabel,
    totalAmountUsd,
    currency: 'USD',
    paypalOrderId: body.paypalOrderId ? String(body.paypalOrderId).trim() : null,
    paypalStatus: body.paypalOrderId ? 'LINKED' : 'UNLINKED',
    status: body.paypalOrderId ? 'FUNDED_SANDBOX' : 'DRAFT',
    milestones: [
      {
        id: 'm1',
        label: 'Milestone 1 · Dispatch & tracking proof',
        percent: firstPct,
        amountUsd: m1Amount,
        condition: 'Seller submits valid tracking & dispatch event',
        status: body.paypalOrderId ? 'UNLOCKED' : 'LOCKED'
      },
      {
        id: 'm2',
        label: 'Milestone 2 · Delivery inspection & dispute-free close',
        percent: secondPct,
        amountUsd: m2Amount,
        condition: 'Buyer confirms receipt or 48h inspection window clears',
        status: 'LOCKED'
      }
    ],
    auditTrail: [{ at: new Date(), event: 'CREATED', detail: `Programmable ${firstPct}/${secondPct} milestone escrow created for $${totalAmountUsd}.` }]
  };

  if (!isDbReady()) {
    const localDoc = { _id: escrowRef, ...payload, createdAt: new Date().toISOString() };
    memoryEscrows.unshift(localDoc);
    return localDoc;
  }
  return EscrowContract.create(payload);
}

async function advanceEscrow(id, action, body = {}) {
  const validActions = ['FUND_SANDBOX', 'VERIFY_DISPATCH', 'RELEASE_NEXT', 'HOLD_DISPUTE'];
  const act = String(action || '').toUpperCase();
  if (!validActions.includes(act)) {
    const err = new Error(`Invalid escrow action. Use one of: ${validActions.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const applyTransition = (doc) => {
    const now = new Date();
    if (act === 'FUND_SANDBOX') {
      const orderId = String(body.paypalOrderId || doc.paypalOrderId || 'SANDBOX-LINKED').trim();
      doc.paypalOrderId = orderId;
      doc.paypalStatus = body.paypalStatus || 'LINKED_SANDBOX';
      doc.status = 'FUNDED_SANDBOX';
      if (doc.milestones[0]?.status === 'LOCKED') doc.milestones[0].status = 'UNLOCKED';
      doc.auditTrail.push({ at: now, event: 'FUNDED_SANDBOX', detail: `Escrow linked to PayPal Sandbox order ${orderId}.` });
    } else if (act === 'VERIFY_DISPATCH') {
      if (doc.status === 'DISPUTE_HOLD') throw Object.assign(new Error('Resolve dispute hold before verifying dispatch.'), { status: 409 });
      doc.status = 'DISPATCH_VERIFIED';
      if (doc.milestones[0]) doc.milestones[0].status = 'UNLOCKED';
      doc.auditTrail.push({ at: now, event: 'DISPATCH_VERIFIED', detail: 'Carrier dispatch verified; Milestone 1 unlocked for release.' });
    } else if (act === 'RELEASE_NEXT') {
      if (doc.status === 'DISPUTE_HOLD') throw Object.assign(new Error('Cannot release milestones while under DISPUTE_HOLD.'), { status: 409 });
      const next = doc.milestones.find((m) => m.status !== 'RELEASED');
      if (!next) throw Object.assign(new Error('All milestones are already released.'), { status: 409 });
      next.status = 'RELEASED';
      next.releasedAt = now;
      const idx = doc.milestones.indexOf(next);
      if (doc.milestones[idx + 1] && doc.milestones[idx + 1].status === 'LOCKED') {
        doc.milestones[idx + 1].status = 'UNLOCKED';
      }
      const allReleased = doc.milestones.every((m) => m.status === 'RELEASED');
      doc.status = allReleased ? 'RELEASED' : 'DISPATCH_VERIFIED';
      doc.auditTrail.push({ at: now, event: 'MILESTONE_RELEASED', detail: `Released ${next.label} ($${next.amountUsd} USD).` });
    } else if (act === 'HOLD_DISPUTE') {
      doc.status = 'DISPUTE_HOLD';
      doc.milestones.forEach((m) => { if (m.status !== 'RELEASED') m.status = 'HELD'; });
      doc.auditTrail.push({ at: now, event: 'DISPUTE_HOLD', detail: String(body.reason || 'Buyer triggered inspection dispute hold; remaining payout frozen.') });
    }
    return doc;
  };

  if (!isDbReady() || String(id).startsWith('DEMO-')) {
    const item = memoryEscrows.find((e) => e._id === id || e.escrowRef === id);
    if (!item) throw Object.assign(new Error('Escrow contract not found.'), { status: 404 });
    return applyTransition(item);
  }

  const doc = await EscrowContract.findById(id);
  if (!doc) throw Object.assign(new Error('Escrow contract not found.'), { status: 404 });
  if (act === 'FUND_SANDBOX' && body.paypalOrderId) {
    const linked = await Payment.findOne({ orderId: String(body.paypalOrderId).trim(), source: 'PAYPAL' }).lean();
    if (linked) body.paypalStatus = linked.status;
  }
  applyTransition(doc);
  await doc.save();
  return doc.toObject();
}

// 3. Cross-Border FX & PYUSD Rail + Group Circle Split-Pay Router
function calculateFxSplit(body = {}) {
  const sourceCurrency = ['INR', 'USD', 'GBP'].includes(String(body.sourceCurrency || 'INR').toUpperCase())
    ? String(body.sourceCurrency || 'INR').toUpperCase()
    : 'INR';
  const amount = Number(body.amount);
  const splitCount = Math.min(20, Math.max(1, Math.round(Number(body.splitCount) || 1)));

  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
    const err = new Error('Enter a valid positive amount to calculate FX and split shares.');
    err.status = 400;
    throw err;
  }

  const rate = FX_TO_USD[sourceCurrency];
  const rawUsdTotal = roundMoney(amount * rate);
  const sandboxPayableUsd = roundMoney(Math.min(5000, Math.max(0.01, rawUsdTotal)));
  const perPersonUsd = roundMoney(Math.max(0.01, sandboxPayableUsd / splitCount));

  const rails = [
    {
      id: 'PYUSD_INSTANT',
      name: 'PayPal PYUSD Programmable Rail (Simulated)',
      feePct: 0.15,
      fixedFeeUsd: 0.02,
      fxMarkupPct: 0,
      settlementTime: '< 5 seconds (on-chain simulation)',
      totalFeeUsd: roundMoney(sandboxPayableUsd * 0.0015 + 0.02),
      perPersonFeeUsd: roundMoney((sandboxPayableUsd * 0.0015 + 0.02) / splitCount)
    },
    {
      id: 'PAYPAL_DIRECT',
      name: 'PayPal Sandbox Checkout (USD Rail)',
      feePct: 2.9,
      fixedFeeUsd: 0.30,
      fxMarkupPct: sourceCurrency === 'USD' ? 0 : 1.5,
      settlementTime: 'Instant authorization + server capture',
      totalFeeUsd: roundMoney(sandboxPayableUsd * (sourceCurrency === 'USD' ? 0.029 : 0.044) + 0.30),
      perPersonFeeUsd: roundMoney((sandboxPayableUsd * (sourceCurrency === 'USD' ? 0.029 : 0.044) + 0.30) / splitCount)
    },
    {
      id: 'LEGACY_CARD',
      name: 'Legacy Cross-Border Card Network',
      feePct: 3.5,
      fixedFeeUsd: 0.45,
      fxMarkupPct: sourceCurrency === 'USD' ? 0 : 3.25,
      settlementTime: '2–3 business days T+2 clearing',
      totalFeeUsd: roundMoney(sandboxPayableUsd * (sourceCurrency === 'USD' ? 0.035 : 0.0675) + 0.45),
      perPersonFeeUsd: roundMoney((sandboxPayableUsd * (sourceCurrency === 'USD' ? 0.035 : 0.0675) + 0.45) / splitCount)
    }
  ];

  const legacy = rails[2].totalFeeUsd;
  const pyusd = rails[0].totalFeeUsd;
  const paypal = rails[1].totalFeeUsd;

  return {
    sourceCurrency,
    sourceAmount: roundMoney(amount),
    indicativeRateToUsd: rate,
    rawUsdTotal,
    sandboxPayableUsd,
    cappedForSandbox: rawUsdTotal > 5000,
    splitCount,
    perPersonUsd,
    perPersonSource: roundMoney(amount / splitCount),
    estimatedSavingsVsCardUsd: roundMoney(Math.max(0, legacy - pyusd)),
    paypalSavingsVsCardUsd: roundMoney(Math.max(0, legacy - paypal)),
    rails,
    notice: 'FX rates and PYUSD settlement fees are indicative hackathon estimates. Actual Sandbox checkout runs in USD (max $5,000.00).'
  };
}

// 4. AI Fraud Shield & Self-Healing Reconciliation Copilot
async function scoreRiskAndProtection(body = {}) {
  const amountUsd = roundMoney(body.amountUsd || 50);
  const merchant = String(body.merchant || 'Sandbox Merchant').trim().slice(0, 80);
  const description = String(body.description || 'Checkout assessment').trim().slice(0, 160);
  const orderId = body.orderId ? String(body.orderId).trim() : null;

  let payment = null;
  let events = [];
  if (orderId && isDbReady()) {
    payment = await Payment.findOne({ $or: [{ orderId }, { merchantReference: orderId }] }).lean();
    if (payment?.orderId) {
      events = await WebhookEvent.find({ orderId: payment.orderId }).sort({ receivedAt: -1 }).limit(10).lean();
    }
  }

  const effectiveAmount = payment ? payment.amount : amountUsd;
  let riskScore = 14;
  const signals = [];

  if (effectiveAmount >= 1000) {
    riskScore += 28;
    signals.push('High-ticket order (>= $1,000 USD) triggers elevated chargeback review.');
  } else if (effectiveAmount >= 250) {
    riskScore += 12;
    signals.push('Mid-high order value: recommend verified shipping & tracking proof.');
  } else {
    signals.push('Low-ticket value fits standard PayPal Seller Protection threshold.');
  }

  if (payment) {
    if (payment.status === 'DENIED' || payment.status === 'FAILED') {
      riskScore += 42;
      signals.push(`Prior payment attempt status is ${payment.status}; require fresh buyer approval.`);
    } else if (payment.status === 'CREATED' || payment.status === 'PENDING') {
      riskScore += 18;
      signals.push(`Order is non-terminal (${payment.status}); do not fulfil before capture completes.`);
    } else if (payment.status === 'COMPLETED') {
      riskScore = Math.max(6, riskScore - 8);
      signals.push('Capture confirmed COMPLETED with PayPal order ID on ledger.');
    }
    const dupes = events.reduce((acc, e) => acc + Number(e.duplicateDeliveries || 0), 0);
    if (dupes > 0) {
      riskScore += 10;
      signals.push(`Observed ${dupes} duplicate webhook delivery(s); idempotency deduplicated safely.`);
    }
  } else {
    signals.push('Pre-checkout simulation: merchant listing + amount evaluated prior to order creation.');
  }

  riskScore = Math.min(98, Math.max(4, riskScore));
  const riskTier = riskScore >= 65 ? 'HIGH' : riskScore >= 35 ? 'MEDIUM' : 'LOW';
  const sellerProtectionEligible = riskTier !== 'HIGH' && (!payment || ['COMPLETED', 'APPROVED', 'CREATED'].includes(payment.status));

  let recommendation = riskTier === 'HIGH'
    ? 'Require step-up buyer verification and hold fulfilment until PayPal capture + tracking proof confirm.'
    : riskTier === 'MEDIUM'
      ? 'Proceed via PayPal Sandbox Checkout with tracking upload enabled for Seller Protection.'
      : 'Low friendly-fraud risk. Safe to proceed with standard PayPal Sandbox capture.';
  let provider = 'RULES';

  if (env.geminiApiKey) {
    try {
      const prompt = [
        'You are PayPulse AI Fraud Shield for PayPal merchant protection.',
        'Return ONLY valid JSON: { "recommendation": string (<=220 chars), "chargebackLikelihood": "LOW"|"MODERATE"|"ELEVATED" }.',
        `Context: ${JSON.stringify({ effectiveAmount, merchant, description, riskScore, riskTier, paymentStatus: payment?.status || 'PRE_CHECKOUT', signals })}`
      ].join('\n');
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(12000)
        }
      );
      const data = await r.json().catch(() => ({}));
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (r.ok && text) {
        const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
        if (parsed.recommendation) {
          recommendation = String(parsed.recommendation).slice(0, 260);
          provider = 'GEMINI';
        }
      }
    } catch {
      // Keep deterministic rules fallback silently.
    }
  }

  return {
    riskScore,
    riskTier,
    sellerProtectionEligible,
    chargebackLikelihood: riskTier === 'HIGH' ? 'ELEVATED' : riskTier === 'MEDIUM' ? 'MODERATE' : 'LOW',
    signals,
    recommendation,
    provider,
    orderId: payment?.orderId || orderId || null,
    paymentStatus: payment?.status || 'PRE_CHECKOUT'
  };
}

async function batchReconcileSandboxOrders(req) {
  if (!isDbReady()) {
    throw Object.assign(new Error('Database connection required for batch reconciliation.'), { status: 503 });
  }
  const openOrders = await Payment.find({
    source: 'PAYPAL',
    orderId: { $exists: true, $ne: null },
    status: { $in: ['CREATED', 'APPROVED', 'PENDING'] }
  }).sort({ createdAt: -1 }).limit(8);

  const report = {
    checked: openOrders.length,
    updated: 0,
    completed: 0,
    approvedReadyToCapture: 0,
    awaitingBuyerApproval: 0,
    errors: 0,
    details: []
  };

  for (const payment of openOrders) {
    try {
      const providerOrder = await getOrder(payment.orderId);
      const providerStatus = statusFromOrder(providerOrder);
      const capture = captureFromOrder(providerOrder);
      const previousStatus = payment.status;
      const nextStatus = providerStatus === 'UNKNOWN' ? payment.status : providerStatus;

      payment.status = nextStatus;
      payment.captureId = capture?.id || payment.captureId;
      payment.rawLastOrder = providerOrder;
      payment.lastSyncedAt = new Date();
      if (providerOrder?.payer?.email_address) payment.payerEmail = providerOrder.payer.email_address;
      if (providerOrder?.payer?.payer_id) payment.payerId = providerOrder.payer.payer_id;
      await payment.save();

      if (previousStatus !== nextStatus) report.updated += 1;
      if (nextStatus === 'COMPLETED') report.completed += 1;
      else if (nextStatus === 'APPROVED') report.approvedReadyToCapture += 1;
      else report.awaitingBuyerApproval += 1;

      await upsertPaymentIncident(payment, payment.status, { source: 'SELF_HEALING_BATCH', previousStatus, providerStatus });
      report.details.push({
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        previousStatus,
        currentStatus: payment.status,
        rawProviderStatus: providerOrder.status,
        approveUrl: extractApproveUrl(providerOrder) || extractApproveUrl(payment.rawCreateResponse)
      });
    } catch (err) {
      report.errors += 1;
      report.details.push({
        orderId: payment.orderId,
        previousStatus: payment.status,
        currentStatus: payment.status,
        error: err.message
      });
    }
  }

  await writeAudit({
    action: 'SELF_HEALING_BATCH_RECONCILED',
    source: 'PAYPAL',
    entityType: 'Payment',
    requestId: req?.requestId,
    details: { checked: report.checked, updated: report.updated, completed: report.completed }
  }).catch(() => {});

  return report;
}

module.exports = {
  FX_TO_USD,
  getGuardrails,
  updateGuardrails,
  evaluateGuardrails,
  listEscrows,
  createEscrow,
  advanceEscrow,
  calculateFxSplit,
  scoreRiskAndProtection,
  batchReconcileSandboxOrders
};
