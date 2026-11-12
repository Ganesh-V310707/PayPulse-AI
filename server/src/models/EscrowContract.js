const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  percent: { type: Number, required: true },
  amountUsd: { type: Number, required: true },
  condition: { type: String, required: true },
  status: {
    type: String,
    enum: ['LOCKED', 'UNLOCKED', 'RELEASED', 'HELD'],
    default: 'LOCKED'
  },
  releasedAt: Date
}, { _id: false });

const escrowContractSchema = new mongoose.Schema({
  escrowRef: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, maxlength: 120 },
  buyerLabel: { type: String, default: 'PayPulse Buyer' },
  merchantLabel: { type: String, required: true, maxlength: 80 },
  totalAmountUsd: { type: Number, required: true, min: 0.01, max: 5000 },
  currency: { type: String, default: 'USD' },
  paypalOrderId: { type: String, index: true },
  paypalStatus: { type: String, default: 'UNLINKED' },
  status: {
    type: String,
    enum: ['DRAFT', 'FUNDED_SANDBOX', 'DISPATCH_VERIFIED', 'RELEASED', 'DISPUTE_HOLD'],
    default: 'DRAFT'
  },
  milestones: [milestoneSchema],
  auditTrail: [{
    at: { type: Date, default: Date.now },
    event: String,
    detail: String
  }]
}, { timestamps: true });

module.exports = mongoose.models.EscrowContract || mongoose.model('EscrowContract', escrowContractSchema);
