import api from './axios.js';

export async function fetchProfile() {
  const { data } = await api.get('/users/me');
  return data;
}

export async function updateProfile(payload) {
  const { data } = await api.patch('/users/me', payload);
  return data;
}

export async function fetchUsers() {
  const { data } = await api.get('/users');
  return data;
}

export async function createUser(payload) {
  const { data } = await api.post('/users', payload);
  return data;
}

export async function updateUser(id, payload) {
  const { data } = await api.patch(`/users/${id}`, payload);
  return data;
}

export async function deleteUser(id) {
  await api.delete(`/users/${id}`);
}
