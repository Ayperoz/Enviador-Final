import { useState } from 'react';
import { updateProfile } from '../api/user.js';
import { useAuth } from '../context/AuthContext.jsx';
import './channels/ModalShared.css';
import './ProfileModal.css';

export default function ProfileModal({ onClose }) {
  const { user, updateStoredUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [clientPhone, setClientPhone] = useState(user?.clientPhone ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const trimmedClientPhone = clientPhone.trim();

    if (!trimmedName) {
      setError('El nombre es obligatorio.');
      setStatus(null);
      return;
    }

    if (!trimmedUsername) {
      setError('El usuario es obligatorio.');
      setStatus(null);
      return;
    }

    if (password && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      setStatus(null);
      return;
    }

    const payload = {};
    if (trimmedName !== (user?.name ?? '')) {
      payload.name = trimmedName;
    }
    if (trimmedUsername !== user?.username) {
      payload.username = trimmedUsername;
    }
    if (trimmedClientPhone !== (user?.clientPhone ?? '')) {
      payload.clientPhone = trimmedClientPhone;
    }
    if (password) {
      payload.password = password;
    }

    if (Object.keys(payload).length === 0) {
      setError('No hay cambios para guardar.');
      setStatus(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const updated = await updateProfile(payload);
      updateStoredUser(updated);
      setName(updated.name ?? trimmedName);
      setUsername(updated.username ?? trimmedUsername);
      setClientPhone(updated.clientPhone ?? trimmedClientPhone);
      setStatus('Cambios guardados correctamente.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('No se pudo actualizar el perfil:', err);
      setError('No se pudo actualizar el perfil. Intenta nuevamente.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal__backdrop" role="dialog" aria-modal="true">
      <div className="profile-modal">
        <button type="button" className="modal__close profile-modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <h2 className="profile-modal__title">Perfil</h2>
        <p className="profile-modal__description">
          Actualiza tu nombre, usuario o contraseña. Deja el campo de contraseña vacío para mantener la actual.
        </p>
        <form className="profile-modal__form" onSubmit={handleSubmit}>
          <label className="profile-modal__field">
            <span>Nombre</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre a mostrar"
            />
          </label>
          <label className="profile-modal__field">
            <span>Usuario</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="usuario@correo.com"
            />
          </label>
          <label className="profile-modal__field">
            <span>Teléfono</span>
            <input
              type="text"
              value={clientPhone}
              onChange={(event) => setClientPhone(event.target.value)}
              placeholder="Teléfono del cliente"
            />
          </label>
          <label className="profile-modal__field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nueva contraseña"
            />
          </label>
          <label className="profile-modal__field">
            <span>Confirmar contraseña</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repite la nueva contraseña"
            />
          </label>
          {error ? <div className="profile-modal__message profile-modal__message--error">{error}</div> : null}
          {status ? <div className="profile-modal__message profile-modal__message--success">{status}</div> : null}
          <div className="profile-modal__actions">
            <button type="button" className="profile-modal__button profile-modal__button--secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="profile-modal__button profile-modal__button--primary" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
