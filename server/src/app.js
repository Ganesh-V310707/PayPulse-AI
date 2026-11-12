const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const env = require('./config/env');
const { requestContext } = require('./middleware/requestContext');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const paymentRoutes = require('./routes/paymentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const devRoutes = require('./routes/devRoutes');
const commerceRoutes = require('./routes/commerceRoutes');
const circlesRoutes = require('./routes/circlesRoutes');
const futureRoutes = require('./routes/futureRoutes');
const lifeOsRoutes = require('./routes/lifeOsRoutes');
const {requireAdmin}=require('./middleware/requireAdmin');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin(origin, callback) {
      const allowed = [env.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];
      if (!origin || allowed.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS policy.'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id','X-Admin-Key', 'X-Life-Role'],
    exposedHeaders: ['X-Request-Id']
  }));
  // Preserve the original PayPal webhook payload for verification.
app.use(
  '/api/webhooks/paypal',
  express.raw({ type: 'application/json', limit: '1mb' })
);

app.use(express.json({ limit: '4.5mb' }));
  app.use(requestContext);
  if (env.nodeEnv !== 'test') app.use(morgan('tiny'));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'paypulse-api',
      timestamp: new Date().toISOString(),
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      integrations: {
        paypal: env.paypalConfigured ? 'configured' : 'needs_credentials',
        paypalWebhook: env.paypalWebhookId ? 'configured' : 'needs_webhook_id',
        gemini: env.geminiApiKey ? 'configured' : 'rules_fallback',
        shopping: env.serpapiKey ? 'configured' : 'not_connected'
      }
    });
  });

  app.get('/api/config/public', (req, res) => {
    res.json({
      paypalClientId: env.paypalConfigured ? env.paypalClientId : '',
      currency: env.paypalCurrency,
      paypalEnvironment: env.paypalEnv,
      paypalConfigured: env.paypalConfigured,
      geminiConfigured: Boolean(env.geminiApiKey),
      webhookConfigured: Boolean(env.paypalWebhookId),
      localScenariosEnabled: env.nodeEnv !== 'production',
      adminEnabled: Boolean(env.adminApiKey && env.adminApiKey.length >= 24),
      shoppingConfigured: Boolean(env.serpapiKey),
      shoppingCountry: env.shoppingCountry
    });
  });

  app.use('/api/payments', requireAdmin, paymentRoutes);
  app.use('/api/dashboard', requireAdmin, dashboardRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/dev', requireAdmin, devRoutes);
  app.use('/api/commerce', commerceRoutes);
  app.use('/api/circles', circlesRoutes);
  app.use('/api/future', futureRoutes);
  app.use('/api/life-os', lifeOsRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
