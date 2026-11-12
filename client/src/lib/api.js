import axios from 'axios';

const envUrl = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  ''
).trim();

// In production, default to the deployed Render backend if VITE_API_URL is not provided.
// In development, default to '/api' which Vite proxies to http://localhost:5000.
const DEFAULT_PROD_API = 'https://paypulse-ai-co36.onrender.com/api';

let baseURL = '/api';
if (envUrl) {
  const clean = envUrl.replace(/\/+$/, '');
  baseURL = clean.endsWith('/api') ? clean : `${clean}/api`;
} else if (import.meta.env.PROD) {
  baseURL = DEFAULT_PROD_API;
}

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const key = sessionStorage.getItem('paypulse-admin-key');
  const path = (config.url || '').replace(/^\/?api\/?/, '/');
  if (key && /^\/?(?:payments|dashboard|dev|future|life-os)(?:\/|\?|$)/i.test(path)) {
    config.headers['X-Admin-Key'] = key;
  }
  const role = sessionStorage.getItem('paypulse-life-role') || 'OWNER';
  if (/^\/?life-os(?:\/|\?|$)/i.test(path)) {
    config.headers['X-Life-Role'] = role;
  }
  return config;
});

export function getErrorMessage(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Something went wrong.';
}

export default api;
