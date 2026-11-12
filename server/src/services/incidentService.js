const Incident = require('../models/Incident');
const { severityForStatus } = require('./paymentState');

async function upsertPaymentIncident(payment, status, evidence = {}) {
  if (!['PENDING', 'DENIED', 'FAILED', 'REFUNDED'].includes(status)) return null;
  const incidentKey = `${payment.source || 'PAYPAL'}:${payment.orderId || payment.merchantReference}:${status}`;
  const titles = {
    PENDING: 'Capture is still pending',
    DENIED: 'PayPal denied the capture',
    FAILED: 'Payment attempt failed',
    REFUNDED: 'Payment was refunded'
  };
  const descriptions = {
    PENDING: 'The payment provider reports a pending capture. Do not fulfil the order until the capture is confirmed as completed.',
    DENIED: 'The payment provider reports a denied capture. Check the buyer funding source and do not retry blindly.',
    FAILED: 'The payment flow did not complete. Re-query the order before attempting another payment.',
    REFUNDED: 'A refund or reversal event was received. Confirm the merchant order and fulfilment state.'
  };
  return Incident.findOneAndUpdate(
    { incidentKey },
    {
      $set: {
        payment: payment._id,
        orderId: payment.orderId,
        source: payment.source || 'PAYPAL',
        type: `PAYMENT_${status}`,
        severity: severityForStatus(status),
        title: titles[status],
        description: descriptions[status],
        recommendation: status === 'PENDING'
          ? 'Wait for a terminal capture event and reconcile with the PayPal Orders API. Do not create a second charge.'
          : status === 'DENIED'
            ? 'Inspect the PayPal error details, communicate the decline, and require a fresh buyer-approved attempt if appropriate.'
            : status === 'REFUNDED'
              ? 'Match the refund to the original capture and update fulfilment and accounting records.'
              : 'Retrieve the order from PayPal, inspect the returned status, and only then decide whether another attempt is safe.',
        evidence
      },
      $setOnInsert: { status: 'OPEN' }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = { upsertPaymentIncident };
