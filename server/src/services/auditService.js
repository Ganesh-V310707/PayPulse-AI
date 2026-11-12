const AuditLog = require('../models/AuditLog');

async function writeAudit({ action, actor = 'SYSTEM', source = 'APP', entityType, entityId, requestId, details }) {
  try {
    await AuditLog.create({ action, actor, source, entityType, entityId, requestId, details });
  } catch (error) {
    console.error('[audit] Unable to write audit record:', error.message);
  }
}

module.exports = { writeAudit };
