const mongoose = require('mongoose');
const env = require('./env');

async function connectDatabase() {
  if (!env.mongoUri) {
    console.warn('[database] MONGODB_URI is empty. Database-backed endpoints will be unavailable.');
    return false;
  }
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 7000 });
    console.log(`[database] Connected to ${mongoose.connection.name}`);
    return true;
  } catch (error) {
    console.error('[database] Connection failed:', error.message);
    return false;
  }
}

module.exports = { connectDatabase };
