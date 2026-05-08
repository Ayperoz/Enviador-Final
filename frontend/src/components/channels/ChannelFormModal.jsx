import { useEffect, useState } from 'react';
import './ModalShared.css';
import './ChannelFormModal.css';
import { COUNTRY_CALLING_CODES } from '../../constants/countryCallingCodes.js';

const defaultValues = {
  name: '',
  areaCode: '549',
  warmupEnabled: true,
  telegramApiId: '',
  telegramApiHash: ''
};

export default function ChannelFormModal({
  initialValues,
  onClose,
  onSubmit,
  channelType = 'whatsapp'
}) {
  const [values, setValues] = useState(defaultValues);
  const isTelegram = channelType === 'telegram';

  useEffect(() => {
    if (initialValues) {
      setValues({
        name: initialValues.name,
        areaCode: initialValues.areaCode || '549',
        warmupEnabled: Boolean(initialValues.warmupEnabled),
        telegramApiId: initialValues.telegramApiId || '',
        telegramApiHash: initialValues.telegramApiHash || ''
      });
    } else {
      setValues(defaultValues);
    }
  }, [initialValues, channelType]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!values.name.trim()) {
      return alert('El nombre es obligatorio.');
    }

    if (isTelegram) {
      if (!values.telegramApiId.trim()) {
        return alert('El Api ID es obligatorio.');
      }
      if (!values.telegramApiHash.trim()) {
        return alert('El Api Hash es obligatorio.');
      }

      return onSubmit({
        channelType: 'telegram',
        name: values.name.trim(),
        apiId: values.telegramApiId.trim(),
        apiHash: values.telegramApiHash.trim()
      });
    }

    const areaCodeDigits = values.areaCode.replace(/[^0-9]/g, '').slice(0, 10) || '549';
    return onSubmit({
      channelType: 'whatsapp',
      name: values.name.trim(),
      areaCode: areaCodeDigits,
      warmupEnabled: values.warmupEnabled
    });
  };

  return (
    <div className="modal__backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal__header">
          <h2>
            {initialValues
              ? 'Editar canal'
              : isTelegram
                ? 'Nuevo canal Telegram'
                : 'Nuevo canal WhatsApp'}
          </h2>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <form className="modal__body" onSubmit={handleSubmit}>
          <label className="modal__label" htmlFor="channel-name">
            Nombre del canal
          </label>
          <input
            id="channel-name"
            name="name"
            value={values.name}
            onChange={handleChange}
            placeholder="Ej. Ventas"
            autoFocus
          />

          {isTelegram ? (
            <>
              <label className="modal__label" htmlFor="telegram-api-id">
                Api ID
              </label>
              <input
                id="telegram-api-id"
                name="telegramApiId"
                value={values.telegramApiId}
                onChange={handleChange}
                placeholder="Ej. 123456"
              />

              <label className="modal__label" htmlFor="telegram-api-hash">
                Api Hash
              </label>
              <input
                id="telegram-api-hash"
                name="telegramApiHash"
                value={values.telegramApiHash}
                onChange={handleChange}
                placeholder="Ej. a1b2c3d4..."
              />
            </>
          ) : (
            <>
              <label className="modal__label" htmlFor="channel-country">
                País
              </label>
              <select
                id="channel-country"
                name="areaCode"
                value={values.areaCode}
                onChange={handleChange}
              >
                {COUNTRY_CALLING_CODES.map(({ country, code }) => (
                  <option key={`${country}-${code}`} value={code}>
                    {country} (+{code})
                  </option>
                ))}
              </select>
            </>
          )}

          <footer className="modal__footer">
            {isTelegram ? (
              <a
                href="https://my.telegram.org/apps"
                target="_blank"
                rel="noreferrer"
                className="modal__button"
              >
                Obtener mi Api ID y Hash
              </a>
            ) : null}
            <button type="button" className="modal__button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="modal__button modal__button--primary">
              Guardar
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
