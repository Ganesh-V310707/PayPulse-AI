const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true, index: true },
  resourceId: String,
  orderId: String,
  source: { type: String, enum: ['PAYPAL_VERIFIED', 'LOCAL_SIMULATION'], default: 'PAYPAL_VERIFIED' },
  verified: { type: Boolean, default: false },
  processed: { type: Boolean, default: false },
  processing: { type: Boolean, default: false },
  processingStartedAt: Date,
  deliveryCount: { type: Number, default: 1 },
  duplicateDeliveries: { type: Number, default: 0 },
  lastDuplicateAt: Date,
  receivedAt: { type: Date, default: Date.now },
  payload: mongoose.Schema.Types.Mixed
}, { timestamps: true, minimize: false });

module.exports = mongoose.models.WebhookEvent || mongoose.model('WebhookEvent', webhookEventSchema);
