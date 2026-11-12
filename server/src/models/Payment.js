const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  merchantReference: { type: String, required: true, unique: true, index: true },
  orderId: { type: String, unique: true, sparse: true, index: true },
  captureId: { type: String, sparse: true, index: true },
  source: { type: String, enum: ['PAYPAL', 'LOCAL_SIMULATION'], default: 'PAYPAL', index: true },
  status: {
    type: String,
    enum: ['CREATED', 'APPROVED', 'PENDING', 'COMPLETED', 'DENIED', 'FAILED', 'REFUNDED', 'UNKNOWN'],
    default: 'CREATED',
    index: true
  },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, uppercase: true },
  description: { type: String, default: 'PayPulse checkout' },
  payerEmail: String,
  payerId: String,
  captureRequestId: String,
  lastError: String,
  observedProviderStatus: String,
  scenarioLabel: String,
  lastSyncedAt: Date,
  rawCreateResponse: mongoose.Schema.Types.Mixed,
  rawCaptureResponse: mongoose.Schema.Types.Mixed,
  rawLastOrder: mongoose.Schema.Types.Mixed
}, { timestamps: true, minimize: false });

paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
