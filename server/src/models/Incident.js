const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  incidentKey: { type: String, required: true, unique: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  orderId: String,
  source: { type: String, enum: ['PAYPAL', 'LOCAL_SIMULATION', 'RECONCILIATION', 'AI'], default: 'PAYPAL' },
  type: { type: String, required: true, index: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM', index: true },
  status: { type: String, enum: ['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED'], default: 'OPEN', index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  recommendation: String,
  evidence: mongoose.Schema.Types.Mixed,
  aiAnalysis: mongoose.Schema.Types.Mixed
}, { timestamps: true, minimize: false });

incidentSchema.index({ createdAt: -1 });
module.exports = mongoose.models.Incident || mongoose.model('Incident', incidentSchema);
