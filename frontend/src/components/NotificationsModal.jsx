import { useState } from 'react';
import { updateProfile } from '../api/user.js';
import { useAuth } from '../context/AuthContext.jsx';
import './channels/ModalShared.css';
import './ProfileModal.css';
import './NotificationsModal.css';

const NOTIFICATION_OPTIONS = [
  { key: 'notifyCampaignStarted', label: 'Campañas iniciadas' },
  { key: 'notifyCampaignFinished', label: 'Campañas finalizadas' },
  { key: 'notifyChannelStarted', label: 'Canales iniciados' },
  { key: 'notifyChannelDisconnected', label: 'Canales desconectados' }
];

export default function NotificationsModal({ onClose }) {
  const { user, updateStoredUser } = useAuth();
  const [values, setValues] = useState(() => {
    const initial = {};
    NOTIFICATION_OPTIONS.forEach(({ key }) => {
      initial[key] = Boolean(user?.[key]);
    });
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const handleToggle = (key) => {
    setValues((prev) => ({ ...prev, [key]: !prev[key] }));
    setStatus(null);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const payload = {};
    let hasChanges = false;

    for (const { key } of NOTIFICATION_OPTIONS) {
      const nextValue = Boolean(values[key]);
      const currentValue = Boolean(user?.[key]);
      if (nextValue !== currentValue) {
        payload[key] = nextValue;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      setError('No hay cambios para guardar.');
      setStatus(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const updated = await updateProfile(payload);
      updateStoredUser(updated);
      setStatus('Preferencias actualizadas correctamente.');
      setValues((prev) => {
        const next = { ...prev };
        NOTIFICATION_OPTIONS.forEach(({ key }) => {
          next[key] = Boolean(updated?.[key]);
        });
        return next;
      });
    } catch (err) {
      console.error('No se pudieron actualizar las notificaciones:', err);
      setError('No se pudieron actualizar las notificaciones. Intenta nuevamente.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal__backdrop" role="dialog" aria-modal="true">
      <div className="profile-modal notifications-modal">
        <button type="button" className="modal__close profile-modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <h2 className="profile-modal__title">Notificaciones</h2>
        <p className="profile-modal__description">
          Activa o desactiva los avisos que recibes sobre campañas y canales.
        </p>
        <form className="notifications-modal__form" onSubmit={handleSubmit}>
          <ul className="notifications-modal__list">
            {NOTIFICATION_OPTIONS.map(({ key, label }) => {
              const enabled = Boolean(values[key]);
              return (
                <li key={key} className="notifications-modal__item">
                  <span className="notifications-modal__label">{label}</span>
                  <button
                    type="button"
                    className={`notifications-modal__switch${enabled ? ' notifications-modal__switch--on' : ''}`}
                    onClick={() => handleToggle(key)}
                    role="switch"
                    aria-checked={enabled}
                    aria-label={label}
                    disabled={loading}
                  >
                    <span className="notifications-modal__switch-handle" />
                  </button>
                </li>
              );
            })}
          </ul>

          {error ? <div className="profile-modal__message profile-modal__message--error">{error}</div> : null}
          {status ? <div className="profile-modal__message profile-modal__message--success">{status}</div> : null}

          <div className="profile-modal__actions">
            <button
              type="button"
              className="profile-modal__button profile-modal__button--secondary"
              onClick={onClose}
              disabled={loading}
            >
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
