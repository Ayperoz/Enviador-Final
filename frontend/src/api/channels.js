import api from './axios.js';

export async function fetchChannels() {
  const { data } = await api.get('/channels');
  return data;
}

export async function createChannel(payload) {
  const { data } = await api.post('/channels', payload);
  return data;
}

export async function updateChannel(id, payload) {
  const { data } = await api.put(`/channels/${id}`, payload);
  return data;
}

export async function deleteChannel(id) {
  await api.delete(`/channels/${id}`);
}

export async function disconnectChannel(id) {
  const { data } = await api.post(`/channels/${id}/session/disconnect`);
  return data;
}

export async function regenerateChannelQr(id) {
  const { data } = await api.post(`/channels/${id}/session/regenerate`);
  return data;
}

export async function fetchChannelQr(id) {
  const { data } = await api.get(`/channels/${id}/qr`);
  return data;
}

export async function startChannelWarmup(id) {
  const { data } = await api.post(`/channels/${id}/warmup/start`);
  return data;
}
