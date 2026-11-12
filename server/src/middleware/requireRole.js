const { requireAdmin } = require('./requireAdmin');

const VALID_ROLES = ['OWNER', 'OPERATOR', 'VIEWER'];

function normalizeRole(raw) {
  const role = String(raw || 'VIEWER').trim().toUpperCase();
  return VALID_ROLES.includes(role) ? role : 'VIEWER';
}

function attachRole(req, _res, next) {
  req.lifeRole = normalizeRole(req.get('X-Life-Role'));
  next();
}

function requireRole(allowedRoles = ['OWNER', 'OPERATOR'], { requireAdminKey = false } = {}) {
  return (req, res, next) => {
    const role = normalizeRole(req.get('X-Life-Role'));
    req.lifeRole = role;
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: 'FORBIDDEN_ROLE',
        message: `Role "${role}" is not permitted for this action. Switch to ${allowedRoles.join(' or ')}.`
      });
    }
    if (requireAdminKey) {
      return requireAdmin(req, res, next);
    }
    return next();
  };
}

module.exports = { VALID_ROLES, normalizeRole, attachRole, requireRole };
