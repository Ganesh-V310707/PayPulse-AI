const crypto = require('node:crypto');
const Payment = require('../models/Payment');
const WebhookEvent = require('../models/WebhookEvent');
const Incident = require('../models/Incident');
const { upsertPaymentIncident } = require('../services/incidentService');
const { writeAudit } = require('../services/auditService');

const scenarios = {
  'capture-db-gap': {
    status: 'PENDING', observedProviderStatus: 'COMPLETED', eventType: null,
    title: 'Provider capture completed; merchant record is stale',
    description: 'LOCAL SIMULATION: the provider-side test fixture says COMPLETED while the merchant ledger remains PENDING, representing a process crash after capture.'
  },
  'duplicate-webhook': {
    status: 'COMPLETED', observedProviderStatus: 'COMPLETED', eventType: 'PAYMENT.CAPTURE.COMPLETED',
    title: 'Repeated webhook delivery detected',
    description: 'LOCAL SIMULATION: the same webhook event ID is delivered multiple times. The event ledger should count deliveries but process the event once.'
  },
  'pending-capture': {
    status: 'PENDING', observedProviderStatus: 'PENDING', eventType: 'PAYMENT.CAPTURE.PENDING',
    title: 'Capture remains pending',
    description: 'LOCAL SIMULATION: the provider has not confirmed a terminal capture state. The merchant must not fulfil or charge again.'
  },
  'denied-capture': {
    status: 'DENIED', observedProviderStatus: 'DENIED', eventType: 'PAYMENT.CAPTURE.DENIED',
    title: 'Capture denied',
    description: 'LOCAL SIMULATION: the payment provider denied the capture. A merchant should inspect the reason and request a fresh buyer-approved attempt when appropriate.'
  },
  'missing-webhook': {
    status: 'COMPLETED', observedProviderStatus: 'COMPLETED', eventType: null,
    title: 'Payment completed without a recorded webhook',
    description: 'LOCAL SIMULATION: the payment ledger is completed, but no completion webhook exists in the local event ledger.'
  }
};

async function createScenario(req, res, next) {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'NOT_FOUND', message: 'Local scenario fixtures are disabled in production.' });
    const scenarioKey = String(req.body.scenario || 'capture-db-gap');
    const config = scenarios[scenarioKey];
    if (!config) return res.status(400).json({ error: 'UNKNOWN_SCENARIO', message: `Choose one of: ${Object.keys(scenarios).join(', ')}` });

    const shortId = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    const orderId = `LOCAL-${shortId}`;
    const payment = await Payment.create({
      merchantReference: `LOCAL-${shortId}`,
      orderId,
      captureId: config.status === 'COMPLETED' ? `LOCAL-CAP-${shortId}` : undefined,
      source: 'LOCAL_SIMULATION',
      status: config.status,
      observedProviderStatus: config.observedProviderStatus,
      scenarioLabel: scenarioKey,
      amount: 49.99,
      currency: 'USD',
      description: `Local test fixture: ${scenarioKey}`,
      lastSyncedAt: new Date()
    });

    if (config.eventType) {
      const eventId = `LOCAL-EVENT-${shortId}`;
      const eventPayload = {
        id: eventId,
        event_type: config.eventType,
        resource: { id: payment.captureId || `LOCAL-RESOURCE-${shortId}`, supplementary_data: { related_ids: { order_id: orderId } } }
      };
      const deliveries = scenarioKey === 'duplicate-webhook' ? 3 : 1;
      const event = await WebhookEvent.create({
        eventId,
        eventType: config.eventType,
        resourceId: eventPayload.resource.id,
        orderId,
        source: 'LOCAL_SIMULATION',
        verified: false,
        processed: true,
        deliveryCount: deliveries,
        duplicateDeliveries: deliveries - 1,
        lastDuplicateAt: deliveries > 1 ? new Date() : undefined,
        payload: eventPayload
      });
      await writeAudit({ action: 'LOCAL_TEST_EVENT_CREATED', source: 'LOCAL_SIMULATION', entityType: 'WebhookEvent', entityId: event.id, requestId: req.requestId, details: { eventId, deliveries } });
    }

    const incident = await Incident.create({
      incidentKey: `LOCAL:${orderId}:${scenarioKey}`,
      payment: payment._id,
      orderId,
      source: 'LOCAL_SIMULATION',
      type: scenarioKey.toUpperCase().replaceAll('-', '_'),
      severity: scenarioKey === 'denied-capture' || scenarioKey === 'capture-db-gap' ? 'HIGH' : 'MEDIUM',
      status: 'OPEN',
      title: config.title,
      description: config.description,
      recommendation: scenarioKey === 'capture-db-gap'
        ? 'Re-query the provider order, verify capture ID and amount, then repair the merchant ledger. Never issue another capture.'
        : scenarioKey === 'duplicate-webhook'
          ? 'Deduplicate on the provider event ID. Record duplicate delivery attempts without re-applying the business action.'
          : scenarioKey === 'pending-capture'
            ? 'Wait for a terminal event and reconcile the order with the provider before fulfilment.'
            : scenarioKey === 'missing-webhook'
              ? 'Reconcile the payment directly with the provider API; a webhook is a notification, not the only source of payment truth.'
              : 'Inspect the provider response and do not retry with a new charge without a fresh buyer-approved attempt.',
      evidence: { simulated: true, scenario: scenarioKey, providerStateFixture: config.observedProviderStatus, localLedgerState: config.status }
    });

    await writeAudit({ action: 'LOCAL_SCENARIO_CREATED', source: 'LOCAL_SIMULATION', entityType: 'Payment', entityId: payment.id, requestId: req.requestId, details: { scenario: scenarioKey, orderId } });
    res.status(201).json({ payment, incident, simulation: true, notice: 'This is local test data. It is not a PayPal transaction or a verified PayPal webhook.' });
  } catch (error) { next(error); }
}

async function clearLocalScenarios(req, res, next) {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'NOT_FOUND', message: 'Local scenario fixtures are disabled in production.' });
    const localPayments = await Payment.find({ source: 'LOCAL_SIMULATION' }).select('_id orderId').lean();
    const ids = localPayments.map((payment) => payment._id);
    const orderIds = localPayments.map((payment) => payment.orderId);
    const [paymentResult, incidentResult, eventResult] = await Promise.all([
      Payment.deleteMany({ source: 'LOCAL_SIMULATION' }),
      Incident.deleteMany({ source: 'LOCAL_SIMULATION' }),
      WebhookEvent.deleteMany({ source: 'LOCAL_SIMULATION' })
    ]);
    await writeAudit({ action: 'LOCAL_SCENARIOS_CLEARED', source: 'LOCAL_SIMULATION', requestId: req.requestId, details: { payments: paymentResult.deletedCount, incidents: incidentResult.deletedCount, events: eventResult.deletedCount } });
    res.json({ cleared: true, payments: paymentResult.deletedCount, incidents: incidentResult.deletedCount, events: eventResult.deletedCount });
  } catch (error) { next(error); }
}

module.exports = { createScenario, clearLocalScenarios };
