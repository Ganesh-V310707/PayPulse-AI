const { createApp } = require('./app');
const { connectDatabase } = require('./config/database');
const env = require('./config/env');

async function start() {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`\nPayPulse API listening on 0.0.0.0:${env.port}`);
    console.log(`PayPal environment: ${env.paypalEnv.toUpperCase()} | Credentials: ${env.paypalConfigured ? 'configured' : 'not configured'}`);
    console.log(`MongoDB: ${require('mongoose').connection.readyState === 1 ? 'connected' : 'not connected'}`);
    console.log('Never use real payment credentials for the local hackathon demo.\n');
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received; shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('[server] Startup failed:', error);
  process.exit(1);
});
