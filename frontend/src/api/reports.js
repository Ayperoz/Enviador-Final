import api from './axios.js';

export async function fetchReportCatalog() {
  const { data } = await api.get('/reports');
  return data;
}

export async function runReport(payload) {
  const { data } = await api.post('/reports/run', payload);
  return data;
}

export async function fetchReportExecutions() {
  const { data } = await api.get('/reports/executions');
  return data;
}

export async function downloadReport(idrun) {
  return api.get(`/reports/download/${idrun}`, { responseType: 'blob' });
}
