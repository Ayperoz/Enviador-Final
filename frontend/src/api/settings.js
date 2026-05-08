import api from './axios.js';

export async function getSettings(config) {
  const { data } = await api.get('/settings', config);
  return data;
}

export async function updateSettings(payload) {
  const { data } = await api.put('/settings', payload);
  return data;
}
