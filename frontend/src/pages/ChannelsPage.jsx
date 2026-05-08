import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  disconnectChannel,
  regenerateChannelQr,
  startChannelWarmup
} from '../api/channels.js';
import ChannelTable from '../components/channels/ChannelTable.jsx';
import ChannelFormModal from '../components/channels/ChannelFormModal.jsx';
import QrModal from '../components/channels/QrModal.jsx';
import SESSION_STATES from '../constants/sessionStates.js';
import { useAuth } from '../context/AuthContext.jsx';
import './ChannelsPage.css';

const WARMUP_COOLDOWN_MS = 60_000;

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [createChannelType, setCreateChannelType] = useState('whatsapp');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [qrChannel, setQrChannel] = useState(null);
  const [warmupCooldowns, setWarmupCooldowns] = useState({});
  const warmupTimeoutsRef = useRef({});
  const createMenuRef = useRef(null);
  const { user } = useAuth();
  const canDeleteChannels = user?.role === 'admin';

  const loadChannels = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      const data = await fetchChannels();
      setChannels(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar los canales.');
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadChannels(true);
    const interval = setInterval(() => {
      loadChannels(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [loadChannels]);

  useEffect(() => {
    if (!qrChannel) {
      return;
    }

    const latest = channels.find((channel) => channel.id === qrChannel.id);
    if (latest && latest.sessionState === SESSION_STATES.CONNECTED) {
      setQrChannel(null);
    }
  }, [channels, qrChannel]);

  useEffect(() => {
    return () => {
      Object.values(warmupTimeoutsRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      warmupTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!qrChannel) {
      return;
    }

    loadChannels(false);
    const interval = setInterval(() => {
      loadChannels(false);
    }, 2000);

    return () => clearInterval(interval);
  }, [qrChannel, loadChannels]);

  useEffect(() => {
    if (!showCreateMenu) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
        setShowCreateMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showCreateMenu]);

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingChannel(null);
    setCreateChannelType('whatsapp');
  };

  const handleCreate = (channelType) => {
    setEditingChannel(null);
    setCreateChannelType(channelType);
    setIsFormOpen(true);
    setShowCreateMenu(false);
  };

  const handleEdit = (channel) => {
    setEditingChannel(channel);
    setIsFormOpen(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingChannel) {
        const updated = await updateChannel(editingChannel.id, values);
        setChannels((prev) => prev.map((ch) => (ch.id === updated.id ? updated : ch)));
      } else {
        const created = await createChannel(values);
        setChannels((prev) => [created, ...prev]);
      }
      await loadChannels(false);
      closeForm();
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.message || 'No se pudo guardar el canal.';
      alert(message);
    }
  };

  const handleDelete = async (channel) => {
    if (!canDeleteChannels) {
      return;
    }
    if (!window.confirm(`¿Eliminar el canal "${channel.name}"?`)) return;
    try {
      await deleteChannel(channel.id);
      setChannels((prev) => prev.filter((ch) => ch.id !== channel.id));
      await loadChannels(false);
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar el canal.');
    }
  };

  const handleDisconnect = async (channel) => {
    try {
      const updated = await disconnectChannel(channel.id);
      setChannels((prev) => prev.map((ch) => (ch.id === updated.id ? updated : ch)));
      await loadChannels(false);
    } catch (err) {
      console.error(err);
      alert('No se pudo desconectar el canal.');
    }
  };

  const handleRegenerate = async (channel) => {
    try {
      const updated = await regenerateChannelQr(channel.id);
      setChannels((prev) => prev.map((ch) => (ch.id === updated.id ? updated : ch)));
      await loadChannels(false);
    } catch (err) {
      console.error(err);
      alert('No se pudo generar un nuevo QR.');
    }
  };

  const handleShowQr = (channel) => {
    setQrChannel(channel);
  };

  const handleStartWarmup = async (channel) => {
    if (warmupCooldowns[channel.id]) {
      return;
    }

    setWarmupCooldowns((prev) => ({ ...prev, [channel.id]: true }));
    if (warmupTimeoutsRef.current[channel.id]) {
      clearTimeout(warmupTimeoutsRef.current[channel.id]);
    }
    warmupTimeoutsRef.current[channel.id] = setTimeout(() => {
      setWarmupCooldowns((prev) => {
        if (!prev[channel.id]) {
          return prev;
        }
        const { [channel.id]: _omit, ...rest } = prev;
        return rest;
      });
      delete warmupTimeoutsRef.current[channel.id];
    }, WARMUP_COOLDOWN_MS);

    try {
      const updated = await startChannelWarmup(channel.id);
      setChannels((prev) => prev.map((ch) => (ch.id === updated.id ? updated : ch)));
      alert('Calentador iniciado, aguarde por favor');
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.message || 'No se pudo iniciar el calentador.';
      alert(message);
    }
  };

  return (
    <div className="channels-page">
      <div className="channels-page__header">
        <div>
          <h1>Canales</h1>
          <p>Administra las conexiones de los canales.</p>
        </div>
        <div className="channels-page__create-menu" ref={createMenuRef}>
          <button
            className="channels-page__button"
            onClick={() => setShowCreateMenu((prev) => !prev)}
            type="button"
          >
            Nuevo canal ▾
          </button>
          {showCreateMenu ? (
            <div className="channels-page__create-menu-list">
              <button type="button" onClick={() => handleCreate('whatsapp')}>
                whatsapp
              </button>
              <button type="button" onClick={() => handleCreate('telegram')}>
                telegram
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {error && <div className="channels-page__error">{error}</div>}

      {loading ? (
        <div className="channels-page__loading">Cargando canales...</div>
      ) : (
        <ChannelTable
          channels={channels}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDisconnect={handleDisconnect}
          onRegenerate={handleRegenerate}
          onShowQr={handleShowQr}
          onStartWarmup={handleStartWarmup}
          warmupDisabled={warmupCooldowns}
          canDelete={canDeleteChannels}
        />
      )}

      {isFormOpen && (
        <ChannelFormModal
          initialValues={editingChannel}
          onClose={closeForm}
          onSubmit={handleSubmit}
          channelType={editingChannel ? 'whatsapp' : createChannelType}
        />
      )}

      {qrChannel && (
        <QrModal
          channel={qrChannel}
          onClose={() => setQrChannel(null)}
          onSessionReady={() => loadChannels(false)}
        />
      )}
    </div>
  );
}
