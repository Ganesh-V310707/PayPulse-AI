const mongoose = require('mongoose');

function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'DATABASE_UNAVAILABLE',
      message: 'MongoDB is not connected. Start the local MongoDB container or configure MONGODB_URI.'
    });
  }
  next();
}

module.exports = { requireDatabase };
