const crypto = require('node:crypto');
const Payment = require('../models/Payment');
const WebhookEvent = require('../models/WebhookEvent');
const Incident = require('../models/Incident');
const { writeAudit } = require('../services/auditService');
const { ensurePayPalConfigured, createOrder, captureOrder, getOrder, extractApproveUrl } = require('../services/paypalService');
const { statusFromOrder, captureFromOrder, makePayPalRequestId } = require('../services/paymentState');
const { upsertPaymentIncident } = require('../services/incidentService');
const { investigatePayment } = require('../services/aiService');
const env = require('../config/env');

function money(value) {
  return Number(Number(value).toFixed(2));
}

function extractPayer(data) {
  return {
    payerEmail: data?.payer?.email_address,
    payerId: data?.payer?.payer_id
  };
}

async function createPayPalOrder(req, res, next) {
  try {
    const amount = Number(req.body.amount);
    const currency = String(req.body.currency || env.paypalCurrency).toUpperCase();
    const description = String(req.body.description || 'PayPulse Sandbox checkout').trim().slice(0, 120);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 5000) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Amount must be between 0.01 and 5,000.00.' });
    }
    if (!/^[A-Z]{3}$/.test(currency) || currency !== env.paypalCurrency) {
      return res.status(400).json({ error: 'INVALID_CURRENCY', message: `This demo is configured for ${env.paypalCurrency}.` });
    }

    // Fail before inserting a local payment if PayPal Sandbox credentials are absent.
    ensurePayPalConfigured();

    const merchantReference = `PP-${crypto.randomUUID().replaceAll('-', '').slice(0, 18).toUpperCase()}`;
    const payment = await Payment.create({
      merchantReference,
      amount: money(amount),
      currency,
      description,
      status: 'CREATED',
      source: 'PAYPAL'
    });

    try {
      const order = await createOrder({ amount, currency, description, merchantReference });
      payment.orderId = order.id;
      payment.rawCreateResponse = order;
      payment.status = statusFromOrder(order) === 'UNKNOWN' ? 'CREATED' : statusFromOrder(order);
      payment.lastSyncedAt = new Date();
      await payment.save();
      await writeAudit({ action: 'PAYPAL_ORDER_CREATED', entityType: 'Payment', entityId: payment.id, requestId: req.requestId, details: { orderId: order.id, amount, currency } });
      return res.status(201).json({
        id: order.id,
        status: order.status,
        merchantReference,
        links: order.links,
        approveUrl: extractApproveUrl(order)
      });
    } catch (error) {
      payment.status = 'FAILED';
      payment.lastError = error.message;
      await payment.save();
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

async function capturePayPalOrder(req, res, next) {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId || orderId.length > 80) return res.status(400).json({ error: 'INVALID_ORDER_ID', message: 'A valid order ID is required.' });
    const payment = await Payment.findOne({ orderId, source: 'PAYPAL' });
    if (!payment) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND', message: 'This order is not in the local payment ledger.' });

    if (payment.status === 'COMPLETED' && payment.rawCaptureResponse) {
      return res.json({
        ...payment.rawCaptureResponse,
        status: 'COMPLETED',
        captureId: payment.captureId,
        payerEmail: payment.payerEmail,
        idempotentReplay: true,
        message: 'Already captured; no additional capture was attempted.'
      });
    }

    // Check provider state first. A timeout must never cause a blind second capture.
    const providerOrder = await getOrder(orderId);
    const providerStatus = statusFromOrder(providerOrder);
    if (providerStatus === 'COMPLETED') {
      const capture = captureFromOrder(providerOrder);
      payment.status = 'COMPLETED';
      payment.captureId = capture?.id || payment.captureId;
      payment.rawLastOrder = providerOrder;
      payment.lastSyncedAt = new Date();
      payment.captureRequestId = payment.captureRequestId || makePayPalRequestId('cap', orderId);
      Object.assign(payment, extractPayer(providerOrder));
      await payment.save();
      return res.json({
        status: 'COMPLETED',
        captureId: payment.captureId,
        payerEmail: payment.payerEmail,
        idempotentReplay: true,
        providerOrder,
        message: 'PayPal already reports this order as completed.'
      });
    }
    if (providerStatus !== 'APPROVED') {
      payment.status = providerStatus === 'UNKNOWN' ? payment.status : providerStatus;
      payment.rawLastOrder = providerOrder;
      payment.lastSyncedAt = new Date();
      await payment.save();
      await upsertPaymentIncident(payment, payment.status, { providerStatus: providerOrder.status, source: 'PRE_CAPTURE_CHECK' });
      return res.status(409).json({
        error: 'ORDER_NOT_APPROVED',
        message: `PayPal currently reports ${providerOrder.status}. Approve the order in PayPal before capture.`,
        providerStatus: providerOrder.status,
        approveUrl: extractApproveUrl(providerOrder) || extractApproveUrl(payment.rawCreateResponse)
      });
    }

    const requestId = payment.captureRequestId || makePayPalRequestId('cap', orderId);
    payment.captureRequestId = requestId;
    await payment.save();

    let captured;
    try {
      captured = await captureOrder(orderId, requestId);
    } catch (captureError) {
      // In ambiguous cases, retrieve the order and trust provider state over a local timeout.
      const refreshed = await getOrder(orderId).catch(() => null);
      if (refreshed && statusFromOrder(refreshed) === 'COMPLETED') {
        const capture = captureFromOrder(refreshed);
        payment.status = 'COMPLETED';
        payment.captureId = capture?.id || payment.captureId;
        payment.rawLastOrder = refreshed;
        payment.lastSyncedAt = new Date();
        Object.assign(payment, extractPayer(refreshed));
        await payment.save();
        return res.json({
          status: 'COMPLETED',
          captureId: payment.captureId,
          payerEmail: payment.payerEmail,
          idempotentReplay: true,
          providerOrder: refreshed,
          message: 'Capture response was ambiguous, but PayPal confirms completion.'
        });
      }
      payment.lastError = captureError.message;
      await payment.save();
      throw captureError;
    }

    const capture = captureFromOrder(captured);
    payment.status = statusFromOrder(captured);
    payment.captureId = capture?.id;
    payment.rawCaptureResponse = captured;
    payment.rawLastOrder = captured;
    payment.lastSyncedAt = new Date();
    Object.assign(payment, extractPayer(captured));
    await payment.save();
    await upsertPaymentIncident(payment, payment.status, { captureId: payment.captureId });
    await writeAudit({ action: 'PAYPAL_ORDER_CAPTURED', entityType: 'Payment', entityId: payment.id, requestId: req.requestId, details: { orderId, captureId: payment.captureId, status: payment.status } });
    return res.json({
      ...captured,
      orderId,
      status: payment.status,
      captureId: payment.captureId,
      payerEmail: payment.payerEmail
    });
  } catch (error) {
    next(error);
  }
}

async function listPayments(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query.source) filter.source = String(req.query.source).toUpperCase();
    const payments = await Payment.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ items: payments, count: payments.length });
  } catch (error) { next(error); }
}

async function getPayment(req, res, next) {
  try {
    const payment = await Payment.findOne({ $or: [{ orderId: req.params.orderId }, { merchantReference: req.params.orderId }] }).lean();
    if (!payment) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    const approveUrl = payment.status === 'CREATED'
      ? (extractApproveUrl(payment.rawLastOrder) || extractApproveUrl(payment.rawCreateResponse))
      : null;
    res.json({ payment, approveUrl });
  } catch (error) { next(error); }
}

async function reconcilePayment(req, res, next) {
  try {
    const payment = await Payment.findOne({ orderId: req.params.orderId, source: 'PAYPAL' });
    if (!payment) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND', message: 'PayPal payment not found.' });
    const providerOrder = await getOrder(payment.orderId);
    const providerStatus = statusFromOrder(providerOrder);
    const capture = captureFromOrder(providerOrder);
    const previousStatus = payment.status;
    payment.status = providerStatus === 'UNKNOWN' ? payment.status : providerStatus;
    payment.captureId = capture?.id || payment.captureId;
    payment.rawLastOrder = providerOrder;
    payment.lastSyncedAt = new Date();
    Object.assign(payment, extractPayer(providerOrder));
    await payment.save();
    const incident = await upsertPaymentIncident(payment, payment.status, { source: 'RECONCILIATION', previousStatus, providerStatus });
    await writeAudit({ action: 'PAYMENT_RECONCILED', entityType: 'Payment', entityId: payment.id, requestId: req.requestId, details: { orderId: payment.orderId, previousStatus, providerStatus, rawProviderStatus: providerOrder.status } });
    res.json({
      payment,
      providerStatus,
      rawProviderStatus: providerOrder.status,
      approveUrl: extractApproveUrl(providerOrder) || extractApproveUrl(payment.rawCreateResponse),
      canCapture: providerStatus === 'APPROVED',
      changed: previousStatus !== payment.status,
      incidentId: incident?._id || null
    });
  } catch (error) { next(error); }
}

async function dashboardSummary(req, res, next) {
  try {
    const [total, completed, pending, denied, local, recentPayments, openIncidents, recentEvents, volume] = await Promise.all([
      Payment.countDocuments(),
      Payment.countDocuments({ status: 'COMPLETED', source: 'PAYPAL' }),
      Payment.countDocuments({ status: 'PENDING' }),
      Payment.countDocuments({ status: { $in: ['DENIED', 'FAILED'] } }),
      Payment.countDocuments({ source: 'LOCAL_SIMULATION' }),
      Payment.find().sort({ createdAt: -1 }).limit(8).lean(),
      Incident.find({ status: { $in: ['OPEN', 'INVESTIGATING'] } }).sort({ createdAt: -1 }).limit(6).lean(),
      WebhookEvent.find().sort({ receivedAt: -1 }).limit(8).lean(),
      Payment.aggregate([
        { $match: { status: 'COMPLETED', source: 'PAYPAL', createdAt: { $gte: new Date(Date.now() - 6 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
        { $sort: { _id: 1 } }
      ])
    ]);
    const completedAmount = await Payment.aggregate([
      { $match: { status: 'COMPLETED', source: 'PAYPAL' } },
      { $group: { _id: '$currency', amount: { $sum: '$amount' } } }
    ]);
    res.json({
      stats: { total, completed, pending, denied, localSimulationCount: local, completedAmount },
      recentPayments,
      openIncidents,
      recentEvents,
      volume
    });
  } catch (error) { next(error); }
}

async function investigate(req, res, next) {
  try {
    const payment = await Payment.findOne({ $or: [{ orderId: req.params.orderId }, { merchantReference: req.params.orderId }] }).lean();
    if (!payment) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    const events = payment.orderId ? await WebhookEvent.find({ orderId: payment.orderId }).sort({ receivedAt: -1 }).limit(12).lean() : [];
    const analysis = await investigatePayment(payment, events);
    await Incident.findOneAndUpdate(
      { incidentKey: `AI:${payment.orderId || payment.merchantReference}` },
      {
        $set: {
          payment: payment._id,
          orderId: payment.orderId,
          source: payment.source,
          type: 'AI_INVESTIGATION',
          severity: analysis.riskLevel,
          title: 'AI payment investigation',
          description: analysis.summary,
          recommendation: analysis.recommendedActions?.[0],
          aiAnalysis: analysis,
          evidence: analysis.evidenceUsed
        },
        $setOnInsert: { status: 'OPEN' }
      },
      { upsert: true, new: true }
    );
    await writeAudit({ action: 'AI_PAYMENT_INVESTIGATED', entityType: 'Payment', entityId: payment._id, requestId: req.requestId, details: { orderId: payment.orderId, provider: analysis.provider } });
    res.json({ analysis });
  } catch (error) { next(error); }
}

async function listIncidents(req, res, next) {
  try {
    const items = await Incident.find().sort({ createdAt: -1 }).limit(100).populate('payment', 'orderId merchantReference amount currency status source').lean();
    res.json({ items, count: items.length });
  } catch (error) { next(error); }
}

async function updateIncident(req, res, next) {
  try {
    const allowed = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED'];
    const status = String(req.body.status || '').toUpperCase();
    if (!allowed.includes(status)) return res.status(400).json({ error: 'INVALID_STATUS', message: `Status must be one of: ${allowed.join(', ')}.` });
    const incident = await Incident.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!incident) return res.status(404).json({ error: 'INCIDENT_NOT_FOUND', message: 'Incident not found.' });
    await writeAudit({ action: 'INCIDENT_STATUS_UPDATED', entityType: 'Incident', entityId: incident.id, requestId: req.requestId, details: { status } });
    res.json({ incident });
  } catch (error) { next(error); }
}

async function listEvents(req, res, next) {
  try {
    const items = await WebhookEvent.find().sort({ receivedAt: -1 }).limit(100).lean();
    res.json({ items, count: items.length });
  } catch (error) { next(error); }
}

module.exports = {
  createPayPalOrder,
  capturePayPalOrder,
  listPayments,
  getPayment,
  reconcilePayment,
  dashboardSummary,
  investigate,
  listIncidents,
  updateIncident,
  listEvents
};
