import api from './axios.js';

export async function fetchCampaigns() {
  const { data } = await api.get('/campains');
  return data;
}

export async function createCampaign(payload) {
  const { data } = await api.post('/campains', payload);
  return data;
}

export async function updateCampaign(id, payload) {
  const { data } = await api.put(`/campains/${id}`, payload);
  return data;
}

export async function deleteCampaign(id) {
  await api.delete(`/campains/${id}`);
}

export async function updateCampaignEnabled(id, enabled) {
  const { data } = await api.patch(`/campains/${id}/enabled`, { enabled });
  return data;
}
