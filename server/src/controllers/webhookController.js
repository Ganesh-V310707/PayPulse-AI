const WebhookEvent = require('../models/WebhookEvent');
const Payment = require('../models/Payment');
const { verifyWebhook } = require('../services/paypalService');
const { statusFromWebhook, shouldApplyWebhookStatus } = require('../services/paymentState');
const { upsertPaymentIncident } = require('../services/incidentService');
const { writeAudit } = require('../services/auditService');

function eventOrderId(event) {
  const resource = event.resource || {};
  return resource.supplementary_data?.related_ids?.order_id ||
    resource.parent_payment ||
    (String(event.event_type || '').startsWith('CHECKOUT.ORDER.') ? resource.id : null);
}

async function receivePayPalWebhook(req, res, next) {
  let claimedEventId = null;
  try {
    let event;

try {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body ?? {});

  event = JSON.parse(rawBody);
} catch {
  return res.status(400).json({
    error: 'INVALID_WEBHOOK_JSON',
    message: 'Webhook body is not valid JSON.'
  });
}
    if (!event?.id || !event?.event_type || !event?.resource) {
      return res.status(400).json({ error: 'INVALID_WEBHOOK', message: 'Expected a PayPal event containing id, event_type and resource.' });
    }

    const verified = await verifyWebhook(req.headers, event);
    if (!verified) return res.status(401).json({ error: 'WEBHOOK_SIGNATURE_INVALID', message: 'PayPal webhook signature verification failed.' });

    const orderId = eventOrderId(event);
    const resourceId = event.resource?.id;
    let stored;
    try {
      stored = await WebhookEvent.create({
        eventId: event.id,
        eventType: event.event_type,
        resourceId,
        orderId,
        source: 'PAYPAL_VERIFIED',
        verified: true,
        processed: false,
        processing: true,
        processingStartedAt: new Date(),
        payload: event
      });
      claimedEventId = event.id;
    } catch (error) {
      if (error.code !== 11000) throw error;

      // Count every repeated delivery. If the first attempt crashed before it
      // completed, allow a later retry to reclaim the event after a short lease.
      await WebhookEvent.updateOne(
        { eventId: event.id },
        { $inc: { deliveryCount: 1, duplicateDeliveries: 1 }, $set: { lastDuplicateAt: new Date() } }
      );

      const existing = await WebhookEvent.findOne({ eventId: event.id });
      if (!existing) throw new Error('Webhook event disappeared after duplicate detection.');
      if (existing.processed) {
        await writeAudit({ action: 'WEBHOOK_DUPLICATE_IGNORED', source: 'PAYPAL', entityType: 'WebhookEvent', entityId: existing.id, requestId: req.requestId, details: { eventId: event.id, deliveryCount: existing.deliveryCount } });
        return res.status(200).json({ received: true, duplicate: true, processedAgain: false, deliveryCount: existing.deliveryCount });
      }

      const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
      stored = await WebhookEvent.findOneAndUpdate(
        {
          eventId: event.id,
          processed: false,
          $or: [
            { processing: false },
            { processing: { $exists: false } },
            { processingStartedAt: { $lt: staleBefore } }
          ]
        },
        { $set: { processing: true, processingStartedAt: new Date() } },
        { new: true }
      );
      if (!stored) {
        res.setHeader('Retry-After', '120');
        return res.status(503).json({ received: true, duplicate: true, inProgress: true, processedAgain: false, message: 'The original delivery is still being processed. Retry later.' });
      }
      claimedEventId = event.id;
    }

    const nextStatus = statusFromWebhook(event.event_type);
    let payment = null;
    if (orderId) payment = await Payment.findOne({ orderId, source: 'PAYPAL' });
    if (!payment && resourceId) payment = await Payment.findOne({ captureId: resourceId, source: 'PAYPAL' });
    if (payment && shouldApplyWebhookStatus(payment.status, nextStatus)) {
      payment.status = nextStatus;
      if (String(event.event_type).startsWith('PAYMENT.CAPTURE.')) payment.captureId = resourceId || payment.captureId;
      payment.lastSyncedAt = new Date();
      await payment.save();
      await upsertPaymentIncident(payment, nextStatus, { webhookEventId: event.id, eventType: event.event_type });
    }

    stored.processed = true;
    stored.processing = false;
    stored.processingStartedAt = undefined;
    await stored.save();
    claimedEventId = null;
    await writeAudit({ action: 'PAYPAL_WEBHOOK_PROCESSED', source: 'PAYPAL', entityType: 'WebhookEvent', entityId: stored.id, requestId: req.requestId, details: { eventId: event.id, eventType: event.event_type, orderId } });
    return res.status(200).json({ received: true, verified: true, processed: true, matchedPayment: Boolean(payment) });
  } catch (error) {
    // Release the processing lease. A PayPal retry can then safely resume.
    if (claimedEventId) {
      await WebhookEvent.updateOne(
        { eventId: claimedEventId, processed: false },
        { $set: { processing: false }, $unset: { processingStartedAt: 1 } }
      ).catch(() => {});
    }
    next(error);
  }
}

module.exports = { receivePayPalWebhook, eventOrderId };
