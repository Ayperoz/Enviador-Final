import { useEffect, useState } from 'react';
import '../channels/ModalShared.css';
import './BaseSelectionModal.css';

export default function BaseSelectionModal({ onCancel, onConfirm, loading, reportName }) {
  const [selectedBase, setSelectedBase] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    setSelectedBase('');
    setError(null);
  }, [reportName]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedBase) {
      setError('Seleccione una base de datos para continuar');
      return;
    }
    setError(null);
    onConfirm(Number(selectedBase));
  };

  return (
    <div className="modal__backdrop" role="dialog" aria-modal="true">
      <div className="base-selection-modal">
        <button
          type="button"
          className="modal__close base-selection-modal__close"
          onClick={onCancel}
          aria-label="Cerrar"
          disabled={loading}
        >
          ×
        </button>
        <h2 className="base-selection-modal__title">Seleccionar base</h2>
        <p className="base-selection-modal__description">
          Elegí la base de datos para ejecutar el {reportName?.toLowerCase() ?? 'reporte'}.
        </p>
        <form className="base-selection-modal__form" onSubmit={handleSubmit}>
          <label className="base-selection-modal__field">
            <span>Base</span>
            <select
              className="base-selection-modal__select"
              value={selectedBase}
              onChange={(event) => setSelectedBase(event.target.value)}
              disabled={loading}
            >
              <option value="">Seleccionar</option>
              {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {error ? <div className="base-selection-modal__message">{error}</div> : null}
          <div className="base-selection-modal__actions">
            <button
              type="button"
              className="base-selection-modal__button base-selection-modal__button--secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="base-selection-modal__button base-selection-modal__button--primary"
              disabled={loading}
            >
              {loading ? 'Ejecutando…' : 'Ejecutar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
