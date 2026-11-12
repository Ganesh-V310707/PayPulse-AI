const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || '',
  requestedPaypalEnv: (process.env.PAYPAL_ENV || 'sandbox').toLowerCase(),
  paypalEnv: 'sandbox',
  paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID || '',
  paypalCurrency: (process.env.PAYPAL_CURRENCY || 'USD').toUpperCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  serpapiKey: process.env.SERPAPI_KEY || '',
  ebayClientId: process.env.EBAY_CLIENT_ID || '',
  ebayClientSecret: process.env.EBAY_CLIENT_SECRET || '',
  shoppingCountry: ['IN','US','GB'].includes(process.env.SHOPPING_COUNTRY) ? process.env.SHOPPING_COUNTRY : 'IN',
  productUserAgent: process.env.PRODUCT_USER_AGENT || '',
  adminApiKey: process.env.ADMIN_API_KEY || '',
};

// This hackathon starter is intentionally locked to Sandbox. It will never call
// PayPal Live, even if someone accidentally sets PAYPAL_ENV=live.
env.paypalBaseUrl = 'https://api-m.sandbox.paypal.com';
env.paypalConfigured = Boolean(
  env.requestedPaypalEnv === 'sandbox' &&
  env.paypalClientId &&
  env.paypalClientSecret &&
  !env.paypalClientId.includes('PASTE_') &&
  !env.paypalClientSecret.includes('PASTE_')
);

module.exports = env;
