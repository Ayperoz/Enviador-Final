import { ArrowPathIcon, SignalIcon, SignalSlashIcon } from '@heroicons/react/24/solid';
import SESSION_STATES from '../../constants/sessionStates.js';
import telegramIco from '../../assets/telegram_ico.svg';
import whatsappIco from '../../assets/whatsapp_ico.svg';
import './ChannelTable.css';

function SessionAction({ channel, onDisconnect, onRegenerate, onShowQr }) {
  const sessionState = channel.sessionState || SESSION_STATES.INITIALIZING;

  if (sessionState === SESSION_STATES.CONNECTED) {
    return (
      <button
        className="channel-table__action channel-table__action--disconnect"
        onClick={() => onDisconnect(channel)}
      >
        Desconectar
      </button>
    );
  }

  if (sessionState === SESSION_STATES.QR_READY) {
    return (
      <div className="channel-table__session-actions channel-table__session-actions--row">
        <button className="channel-table__action channel-table__action--primary" onClick={() => onShowQr(channel)}>
          Mostrar QR
        </button>
        <button className="channel-table__action" onClick={() => onRegenerate(channel)}>
          Generar Nuevo QR
        </button>
      </div>
    );
  }

  if (sessionState === SESSION_STATES.INITIALIZING) {
    return (
      <div className="channel-table__session-actions channel-table__session-actions--row">
        <button
          className="channel-table__action channel-table__action--primary"
          onClick={() => onShowQr(channel)}
        >
          Mostrar QR
        </button>
        <button className="channel-table__action" onClick={() => onRegenerate(channel)}>
          Generar Nuevo QR
        </button>
      </div>
    );
  }

  if (sessionState === SESSION_STATES.CONNECTING) {
    return (
      <div className="channel-table__session-actions channel-table__session-actions--row">
        <button className="channel-table__action channel-table__action--primary" onClick={() => onShowQr(channel)}>
          Mostrar QR
        </button>
        <button className="channel-table__action" onClick={() => onRegenerate(channel)}>
          Generar Nuevo QR
        </button>
      </div>
    );
  }

  if (sessionState === SESSION_STATES.DISCONNECTED) {
    return (
      <div className="channel-table__session-actions">
        <span className="channel-table__badge channel-table__badge--alert">Sesión caducada</span>
        <button className="channel-table__action channel-table__action--primary" onClick={() => onRegenerate(channel)}>
          Generar Nuevo QR
        </button>
      </div>
    );
  }

  return (
    <div className="channel-table__session-actions channel-table__session-actions--row">
      <button className="channel-table__action channel-table__action--primary" onClick={() => onShowQr(channel)}>
        Mostrar QR
      </button>
      <button className="channel-table__action" onClick={() => onRegenerate(channel)}>
        Generar Nuevo QR
      </button>
    </div>
  );
}

export default function ChannelTable({
  channels,
  onEdit,
  onDelete,
  onDisconnect,
  onRegenerate,
  onShowQr,
  onStartWarmup,
  warmupDisabled = {},
  canDelete = true
}) {
  if (channels.length === 0) {
    return <div className="channel-table__empty">Aún no tienes canales configurados.</div>;
  }

  return (
    <div className="channel-table__wrapper">
      <table className="channel-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Número de WhatsApp</th>
            <th>Estado</th>
            <th>Iniciar calentador</th>
            <th>Sesión</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => (
            <tr key={channel.id}>
              <td>
                <div className="channel-table__name-cell">
                  <span
                    className={`channel-table__type-icon channel-table__type-icon--${
                      channel.channelType === 'telegram' ? 'telegram' : 'whatsapp'
                    }`}
                    aria-label={channel.channelType === 'telegram' ? 'Canal Telegram' : 'Canal WhatsApp'}
                    title={channel.channelType === 'telegram' ? 'Canal Telegram' : 'Canal WhatsApp'}
                  >
                    <img
                      src={channel.channelType === 'telegram' ? telegramIco : whatsappIco}
                      alt={channel.channelType === 'telegram' ? 'Telegram' : 'WhatsApp'}
                    />
                  </span>
                  <span>{channel.name}</span>
                </div>
              </td>
              <td>
                {channel.phoneNumber
                  ? `+${channel.phoneNumber}`
                  : (channel.areaCode ? `Código ${channel.areaCode}` : 'Sin asignar')}
              </td>
              <td>
                {channel.status === 'connected' ? (
                  <span className="channel-table__status channel-table__status--online">
                    <SignalIcon className="channel-table__status-icon" /> Conectado
                  </span>
                ) : channel.status === 'connecting' ? (
                  <span className="channel-table__status channel-table__status--pending">
                    <ArrowPathIcon className="channel-table__status-icon channel-table__status-icon--spin" />
                    Conectando
                  </span>
                ) : (
                  <span className="channel-table__status channel-table__status--offline">
                    <SignalSlashIcon className="channel-table__status-icon" /> Desconectado
                  </span>
                )}
              </td>
              <td>
                {channel.calentador ? (
                  <div className="channel-table__warmup">
                    <button
                      className="channel-table__action channel-table__action--primary channel-table__warmup-button"
                      onClick={() => onStartWarmup?.(channel)}
                      disabled={
                        channel.sessionState !== SESSION_STATES.CONNECTED ||
                        Boolean(warmupDisabled[channel.id])
                      }
                    >
                      Iniciar
                    </button>
                  </div>
                ) : null}
              </td>
              <td>
                <SessionAction
                  channel={channel}
                  onDisconnect={onDisconnect}
                  onRegenerate={onRegenerate}
                  onShowQr={onShowQr}
                />
              </td>
              <td className="channel-table__actions">
                <button className="channel-table__action" onClick={() => onEdit(channel)}>
                  Editar
                </button>
                {canDelete ? (
                  <button
                    className="channel-table__action channel-table__action--danger"
                    onClick={() => onDelete(channel)}
                  >
                    Eliminar
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
