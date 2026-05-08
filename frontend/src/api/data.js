import api from './axios.js';

export async function uploadData(base, file) {
  const formData = new FormData();
  formData.append('base', base);
  formData.append('file', file);

  const { data } = await api.post('/data/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return data;
}

export async function fetchUploads() {
  const { data } = await api.get('/data/uploads');
  return data;
}
