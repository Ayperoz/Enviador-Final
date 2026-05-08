import './SessionTimeoutModal.css';

const MESSAGES = {
  timeout: {
    title: 'Sesión finalizada',
    description:
      'Se ha cerrado la sesión por inactividad. Vuelve a iniciar sesión para continuar trabajando.'
  },
  remote: {
    title: 'Sesión finalizada',
    description:
      'Tu cuenta se ha iniciado en otro dispositivo. Vuelve a iniciar sesión para continuar trabajando.'
  }
};

export default function SessionTimeoutModal({ onClose, reason = 'timeout' }) {
  const message = MESSAGES[reason] || MESSAGES.timeout;
  return (
    <div className="timeout-modal__backdrop" role="alertdialog" aria-modal="true">
      <div className="timeout-modal">
        <h2>{message.title}</h2>
        <p>{message.description}</p>
        <button type="button" onClick={onClose} className="timeout-modal__button">
          Entendido
        </button>
      </div>
    </div>
  );
}
