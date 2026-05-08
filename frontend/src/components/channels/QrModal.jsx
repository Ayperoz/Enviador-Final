import { useEffect, useState } from 'react';

import { fetchChannelQr } from '../../api/channels.js';
import SESSION_STATES from '../../constants/sessionStates.js';
import './ModalShared.css';
import './QrModal.css';

const QR_REFRESH_INTERVAL_MS = 25_000;

export default function QrModal({ channel, onClose, onSessionReady }) {
  const [qrCode, setQrCode] = useState(null);
  const [status, setStatus] = useState(SESSION_STATES.INITIALIZING);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    const scheduleNextRequest = (delay) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (cancelled) {
        return;
      }

      timeoutId = setTimeout(() => {
        requestQr();
      }, delay);
    };

    async function requestQr() {
      try {
        const response = await fetchChannelQr(channel.id);
        if (cancelled) return;

        if (response.status === SESSION_STATES.CONNECTED) {
          onSessionReady?.();
          onClose();
          return;
        }

        if (response.status === SESSION_STATES.CONNECTING) {
          setQrCode(null);
          setStatus(SESSION_STATES.CONNECTING);
          setError(null);
          scheduleNextRequest(3000);
        } else if (response.qrCode) {
          setQrCode(response.qrCode);
          setStatus(SESSION_STATES.QR_READY);
          setError(null);
          scheduleNextRequest(QR_REFRESH_INTERVAL_MS);
        } else if (response.status === SESSION_STATES.INITIALIZING) {
          setQrCode(null);
          setStatus(SESSION_STATES.INITIALIZING);
          setError(null);
          scheduleNextRequest(4000);
        } else if (response.status === SESSION_STATES.DISCONNECTED) {
          setQrCode(null);
          setStatus(SESSION_STATES.DISCONNECTED);
        } else {
          setStatus(SESSION_STATES.INITIALIZING);
          scheduleNextRequest(4000);
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        const apiMessage = err?.response?.data?.message;
        if (apiMessage === 'Api ID o Hash Incorrecto, por favor verifique los datos') {
          setError(apiMessage);
          setStatus('error');
          return;
        }
        setError('No se pudo obtener el código QR. Reintentando...');
        setStatus('error');
        scheduleNextRequest(5000);
      }
    }

    requestQr();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [channel.id, onClose, onSessionReady]);

  let content;
  if (status === SESSION_STATES.QR_READY && qrCode) {
    content = <img src={qrCode} alt={`QR para ${channel.name}`} />;
  } else if (status === 'error') {
    content = <p className="qr-modal__error">{error}</p>;
  } else if (status === SESSION_STATES.CONNECTING) {
    content = (
      <div className="qr-modal__loading">
        <span className="qr-modal__spinner" aria-hidden="true" />
        Vinculando dispositivo...
      </div>
    );
  } else if (status === SESSION_STATES.DISCONNECTED) {
    content = (
      <div className="qr-modal__fallback">
        <p>La sesión caducó. Genera un nuevo QR desde la tabla de canales.</p>
      </div>
    );
  } else {
    content = (
      <div className="qr-modal__loading">
        <span className="qr-modal__spinner" aria-hidden="true" />
        Generando código QR...
      </div>
    );
  }

  return (
    <div className="modal__backdrop" role="dialog" aria-modal="true">
      <div className="qr-modal">
        <button className="modal__close qr-modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <header className="qr-modal__header">
          <span className="qr-modal__subtitle">Canal</span>
          <h2 className="qr-modal__title">{channel.name}</h2>
        </header>
        <div className="qr-modal__card">
          <div className="qr-modal__instructions">
            <h3>
              {channel.channelType === 'telegram'
                ? 'Para usar Telegram en el enviador'
                : 'Para usar WhatsApp en el enviador'}
            </h3>
            <ol className="qr-modal__steps">
              {channel.channelType === 'telegram' ? (
                <>
                  <li>Abre Telegram en tu teléfono.</li>
                  <li>Busca la opción Ajustes -&gt; Dispositivos.</li>
                  <li>
                    Presiona Vincular un dispositivo y escanea el código QR que se muestra a la
                    derecha.
                  </li>
                </>
              ) : (
                <>
                  <li>Abre WhatsApp en tu teléfono.</li>
                  <li>Ve a “Dispositivos vinculados” y toca “Vincular un dispositivo”.</li>
                  <li>Apunta la cámara al código QR que se muestra a la derecha.</li>
                </>
              )}
            </ol>
          </div>
          <div className="qr-modal__code">
            <div className="qr-modal__code-frame">{content}</div>
            <p className="qr-modal__hint">El código se actualiza automáticamente si caduca.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
