import api from './axios.js';

export async function fetchMonitorCampaigns() {
  const { data } = await api.get('/monitor/campaigns');
  return data?.campaigns ?? [];
}

export async function fetchMonitorLogs(campaignId) {
  const params = {};
  if (campaignId) {
    params.campaignId = campaignId;
  }
  const { data } = await api.get('/monitor/logs', { params });
  return data?.logs ?? [];
}
