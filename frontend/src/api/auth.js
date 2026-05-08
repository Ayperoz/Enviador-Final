import api from './axios.js';

export async function loginRequest(credentials) {
  const { data } = await api.post('/auth/login', credentials);
  return data;
}
