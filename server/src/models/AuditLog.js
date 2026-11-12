const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  actor: { type: String, default: 'SYSTEM' },
  source: { type: String, default: 'APP' },
  entityType: String,
  entityId: String,
  requestId: String,
  details: mongoose.Schema.Types.Mixed
}, { timestamps: true, minimize: false });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
