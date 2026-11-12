import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 25000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const key = sessionStorage.getItem('paypulse-admin-key');
  if (key && config.url && /^\/(?:payments|dashboard|dev|future|life-os)(?:\/|$)/.test(config.url)) {
    config.headers['X-Admin-Key'] = key;
  }
  const role = sessionStorage.getItem('paypulse-life-role') || 'OWNER';
  if (config.url && /^\/life-os(?:\/|$)/.test(config.url)) {
    config.headers['X-Life-Role'] = role;
  }
  return config;
});

export function getErrorMessage(error) {
  return error?.response?.data?.message || error?.message || 'Something went wrong.';
}

export default api;
