import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { fetchMonitorCampaigns, fetchMonitorLogs } from '../api/monitor.js';
import './MonitorPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const MAX_LOGS = 500;

function formatTimestamp(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('es-AR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function mergeCampaignCollections(current, incoming) {
  const map = new Map();

  for (const item of current || []) {
    map.set(String(item.id), item.name);
  }

  for (const item of incoming || []) {
    if (item && item.id != null) {
      map.set(String(item.id), item.name);
    }
  }

  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function MonitorPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Conectando...');
  const logContainerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaigns() {
      try {
        const data = await fetchMonitorCampaigns();
        if (!cancelled) {
          setCampaigns((prev) => mergeCampaignCollections(prev, data));
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('No se pudieron cargar las campañas del monitor.');
        }
      }
    }

    loadCampaigns();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      try {
        const data = await fetchMonitorLogs(selectedCampaign);
        if (!cancelled) {
          setLogs(data.slice(-MAX_LOGS));
          setError(null);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('No se pudieron cargar los logs de la campaña seleccionada.');
        }
      }
    }

    loadLogs();

    return () => {
      cancelled = true;
    };
  }, [selectedCampaign]);

  useEffect(() => {
    const container = logContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setConnectionStatus('Token no disponible');
      return () => {};
    }

    setConnectionStatus('Conectando...');

    const params = new URLSearchParams();
    params.append('token', token);
    if (selectedCampaign) {
      params.append('campaignId', selectedCampaign);
    }

    const source = new EventSource(`${API_BASE_URL}/monitor/stream?${params.toString()}`);

    source.addEventListener('open', () => {
      setConnectionStatus('Conectado');
    });

    source.addEventListener('error', (event) => {
      console.error('Monitor stream error', event);
      setConnectionStatus('Reconectando...');
      setError('Se perdió la conexión con el monitor. Reintentando...');
    });

    source.addEventListener('snapshot', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (Array.isArray(payload.campaigns)) {
          setCampaigns((prev) => mergeCampaignCollections(prev, payload.campaigns));
        }
        if (Array.isArray(payload.logs)) {
          setLogs(payload.logs.slice(-MAX_LOGS));
        }
        setError(null);
        setConnectionStatus('Conectado');
      } catch (err) {
        console.error('Error parsing snapshot', err);
      }
    });

    source.addEventListener('campaigns', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (Array.isArray(payload)) {
          setCampaigns((prev) => mergeCampaignCollections(prev, payload));
        }
      } catch (err) {
        console.error('Error parsing campaigns update', err);
      }
    });

    source.addEventListener('log', (event) => {
      try {
        const entry = JSON.parse(event.data);
        setLogs((prev) => {
          const next = [...prev, entry];
          if (next.length > MAX_LOGS) {
            return next.slice(-MAX_LOGS);
          }
          return next;
        });
      } catch (err) {
        console.error('Error parsing log entry', err);
      }
    });

    return () => {
      source.close();
    };
  }, [selectedCampaign]);

  const options = useMemo(() => {
    const base = [{ value: '', label: 'Todas las campañas' }];
    return base.concat(
      campaigns.map((campaign) => ({ value: String(campaign.id), label: campaign.name }))
    );
  }, [campaigns]);

  const selectedCampaignName = useMemo(() => {
    if (!selectedCampaign) {
      return null;
    }

    const match = campaigns.find((campaign) => String(campaign.id) === String(selectedCampaign));
    return match ? match.name : `Campaña ${selectedCampaign}`;
  }, [campaigns, selectedCampaign]);

  const statusMeta = useMemo(() => {
    const normalized = connectionStatus.toLowerCase();

    if (normalized.startsWith('conectado')) {
      return {
        tone: 'ok',
        icon: <CheckCircleIcon className="monitor-page__status-icon" aria-hidden="true" />
      };
    }

    if (normalized.includes('reconectando') || normalized.includes('conectando')) {
      return {
        tone: 'pending',
        icon: (
          <ArrowPathIcon
            className="monitor-page__status-icon monitor-page__status-icon--spin"
            aria-hidden="true"
          />
        )
      };
    }

    return {
      tone: 'error',
      icon: <ExclamationTriangleIcon className="monitor-page__status-icon" aria-hidden="true" />
    };
  }, [connectionStatus]);

  return (
    <div className="monitor-page">
      <div className="monitor-page__header">
        <h1>Monitor</h1>
        <p className="monitor-page__description">
          Visualiza en tiempo real los envíos y estados de cada campaña activa.
        </p>
      </div>

      <div className="monitor-page__controls">
        <select
          className="monitor-page__select"
          value={selectedCampaign}
          onChange={(event) => setSelectedCampaign(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className={`monitor-page__status-badge monitor-page__status-badge--${statusMeta.tone}`}>
          <span className="monitor-page__status-label">Estado</span>
          <span className="monitor-page__status-separator">:</span>
          <span className="monitor-page__status-text">{connectionStatus}</span>
          {statusMeta.icon}
        </div>
      </div>

      {error && <div className="monitor-page__error">{error}</div>}

      <div className="monitor-page__panel">
        <div className="monitor-page__panel-header">
          <h2 className="monitor-page__panel-title">Logs en tiempo real</h2>
          {selectedCampaignName && (
            <span className="monitor-page__status">
              Mostrando: {selectedCampaignName}
            </span>
          )}
        </div>

        <div ref={logContainerRef} className="monitor-page__log-container">
          {logs.length === 0 ? (
            <div className="monitor-page__empty">
              No hay registros para mostrar en este momento.
            </div>
          ) : (
            logs.map((entry) => (
              <p key={entry.id} className="monitor-page__log-entry">
                <span className="monitor-page__timestamp">[{formatTimestamp(entry.timestamp)}]</span>
                {!selectedCampaign && entry.campaignName && (
                  <span className="monitor-page__campaign">{entry.campaignName}</span>
                )}
                {entry.message}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
