import { useEffect, useMemo, useState } from 'react';
import '../channels/ModalShared.css';
import '../channels/ChannelFormModal.css';
import './CampaignFormModal.css';

const DAY_OPTIONS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' }
];

const BASE_OPTIONS = Array.from({ length: 9 }, (_, index) => String(index + 1));

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_DAY = { enabled: true, start: '08:00', pause: '12:00', resume: '13:00', end: '18:00' };

function createDefaultSchedule() {
  return DAY_OPTIONS.reduce((acc, { key }) => {
    acc[key] = { ...DEFAULT_DAY };
    return acc;
  }, {});
}

function buildDefaultValues() {
  return {
    name: '',
    channelIds: [],
    minDelay: '20',
    maxDelay: '40',
    base: '',
    schedule: createDefaultSchedule()
  };
}

function mergeSchedule(schedule) {
  const base = createDefaultSchedule();
  if (!schedule || typeof schedule !== 'object') {
    return base;
  }

  DAY_OPTIONS.forEach(({ key }) => {
    if (schedule[key]) {
      base[key] = {
        enabled: schedule[key].enabled !== undefined ? Boolean(schedule[key].enabled) : DEFAULT_DAY.enabled,
        start: schedule[key].start || DEFAULT_DAY.start,
        pause: schedule[key].pause || DEFAULT_DAY.pause,
        resume: schedule[key].resume || DEFAULT_DAY.resume,
        end: schedule[key].end || DEFAULT_DAY.end
      };
    }
  });

  return base;
}

export default function CampaignFormModal({ initialValues, channels, onClose, onSubmit }) {
  const [values, setValues] = useState(buildDefaultValues);

  const availableChannels = useMemo(() => {
    const map = new Map();

    channels.forEach((channel) => {
      if (channel && channel.id != null) {
        map.set(channel.id, channel);
      }
    });

    (initialValues?.channels ?? []).forEach((channel) => {
      if (channel && channel.id != null && !map.has(channel.id)) {
        map.set(channel.id, channel);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const nameA = a.name?.toLowerCase() ?? '';
      const nameB = b.name?.toLowerCase() ?? '';
      return nameA.localeCompare(nameB);
    });
  }, [channels, initialValues]);

  useEffect(() => {
    if (initialValues) {
      setValues({
        name: initialValues.name || '',
        channelIds: Array.isArray(initialValues.channelIds)
          ? initialValues.channelIds.map((id) => String(id))
          : initialValues.channelId
            ? [String(initialValues.channelId)]
            : [],
        minDelay: initialValues.minDelay ? String(initialValues.minDelay) : '20',
        maxDelay: initialValues.maxDelay ? String(initialValues.maxDelay) : '40',
        base: initialValues.base ? String(initialValues.base) : '',
        schedule: mergeSchedule(initialValues.schedule)
      });
    } else {
      setValues(buildDefaultValues());
    }
  }, [initialValues]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleScheduleChange = (dayKey, field, value) => {
    setValues((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [dayKey]: {
          ...prev.schedule[dayKey],
          [field]: value
        }
      }
    }));
  };

  const handleDayToggle = (dayKey, enabled) => {
    setValues((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [dayKey]: {
          ...prev.schedule[dayKey],
          enabled
        }
      }
    }));
  };

  const handleChannelToggle = (channelId) => {
    setValues((prev) => {
      const id = String(channelId);
      const isSelected = prev.channelIds.includes(id);
      const nextIds = isSelected
        ? prev.channelIds.filter((item) => item !== id)
        : [...prev.channelIds, id];

      return {
        ...prev,
        channelIds: nextIds
      };
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedName = values.name.trim();
    if (!trimmedName) {
      return alert('El nombre es obligatorio.');
    }

    if (values.channelIds.length === 0) {
      return alert('Selecciona al menos un canal.');
    }

    const min = Number(values.minDelay);
    const max = Number(values.maxDelay);
    if (!Number.isFinite(min) || min <= 0) {
      return alert('El tiempo mínimo debe ser mayor a cero.');
    }
    if (!Number.isFinite(max) || max <= 0) {
      return alert('El tiempo máximo debe ser mayor a cero.');
    }
    if (min > max) {
      return alert('El tiempo mínimo no puede ser mayor que el máximo.');
    }

    if (!values.base) {
      return alert('Seleccione una base de datos para continuar');
    }

    const baseValue = Number(values.base);
    if (!Number.isInteger(baseValue) || baseValue < 1 || baseValue > 9) {
      return alert('La base debe estar entre 1 y 9.');
    }

    const schedulePayload = {};
    for (const { key, label } of DAY_OPTIONS) {
      const daySchedule = values.schedule[key];
      if (!daySchedule) {
        return alert(`Faltan los horarios para ${label}.`);
      }

      const { enabled, start, pause, resume, end } = daySchedule;
      if (enabled !== false) {
        if (![start, pause, resume, end].every((time) => TIME_REGEX.test(time))) {
          return alert(`Verifica las horas de ${label} (formato HH:MM).`);
        }
      }

      schedulePayload[key] = {
        enabled: enabled !== false,
        start,
        pause,
        resume,
        end
      };
    }

    onSubmit({
      name: trimmedName,
      channelIds: values.channelIds.map((id) => Number(id)),
      minDelay: min,
      maxDelay: max,
      base: baseValue,
      schedule: schedulePayload
    });
  };

  const hasSelectableChannels = availableChannels.length > 0;
  const selectedCount = values.channelIds.length;

  return (
    <div className="modal__backdrop" role="dialog" aria-modal="true">
      <div className="modal modal--campaign">
        <header className="modal__header">
          <h2>{initialValues ? 'Editar campaña' : 'Nueva campaña'}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <form className="modal__body" onSubmit={handleSubmit}>
          <div className="campaign-form__content">
            <div className="campaign-form__grid">
              <div className="campaign-form__column">
                <label className="campaign-form__label" htmlFor="campaign-name">
                  Nombre
                  <input
                    id="campaign-name"
                    name="name"
                    className="campaign-form__input"
                    value={values.name}
                    onChange={handleChange}
                    placeholder="Ej. Campaña de bienvenida"
                    autoFocus
                  />
                </label>

                <div className="campaign-form__block">
                  <div className="campaign-form__label campaign-form__label--inline">
                    <span>Canales de envío</span>
                    <span className="campaign-form__label-helper">
                      Selecciona uno o varios canales disponibles
                    </span>
                  </div>

                  <div
                    className={`campaign-form__channel-list${
                      hasSelectableChannels ? '' : ' campaign-form__channel-list--empty'
                    }`}
                  >
                    {hasSelectableChannels ? (
                      availableChannels.map((channel) => {
                        const id = String(channel.id);
                        const checked = values.channelIds.includes(id);
                        const status = (channel.status || '').toLowerCase();
                        const isConnected = status === 'connected';
                        const phoneLabel = channel.phoneNumber
                          ? channel.phoneNumber.startsWith('+')
                            ? channel.phoneNumber
                            : `+${channel.phoneNumber}`
                          : 'Sin número asignado';

                        return (
                          <label
                            key={channel.id}
                            className={`campaign-form__channel-option${
                              checked ? ' campaign-form__channel-option--selected' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleChannelToggle(channel.id)}
                            />
                            <div className="campaign-form__channel-info">
                              <span className="campaign-form__channel-name">{channel.name}</span>
                              <span className="campaign-form__channel-meta">{phoneLabel}</span>
                            </div>
                            <span
                              className={`campaign-form__channel-status campaign-form__channel-status--${
                                isConnected ? 'online' : 'offline'
                              }`}
                            >
                              {isConnected ? 'Conectado' : 'Desconectado'}
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="campaign-form__helper">Crea un canal antes de armar tu campaña.</p>
                    )}
                  </div>
                  {hasSelectableChannels && selectedCount === 0 && (
                    <p className="campaign-form__helper">Selecciona al menos un canal para continuar.</p>
                  )}
                  {selectedCount > 1 && (
                    <p className="campaign-form__helper campaign-form__helper--accent">
                      Se enviará la campaña a través de {selectedCount} canales.
                    </p>
                  )}
                </div>
              </div>

              <div className="campaign-form__column campaign-form__column--compact">
                <label className="campaign-form__label" htmlFor="campaign-base">
                  Base
                  <span>Seleccione una base entre 1 y 9</span>
                  <select
                    id="campaign-base"
                    name="base"
                    className="campaign-form__input campaign-form__select"
                    value={values.base}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar</option>
                    {BASE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="campaign-form__row">
                  <label className="campaign-form__label" htmlFor="campaign-min">
                    Tiempo mínimo (seg.)
                    <input
                      id="campaign-min"
                      name="minDelay"
                      type="number"
                      min="1"
                      className="campaign-form__input"
                      value={values.minDelay}
                      onChange={handleChange}
                    />
                  </label>
                  <label className="campaign-form__label" htmlFor="campaign-max">
                    Tiempo máximo (seg.)
                    <input
                      id="campaign-max"
                      name="maxDelay"
                      type="number"
                      min="1"
                      className="campaign-form__input"
                      value={values.maxDelay}
                      onChange={handleChange}
                    />
                  </label>
                </div>
              </div>
            </div>

            <section className="campaign-form__schedule-section">
              <header className="campaign-form__schedule-header">
                <div>
                  <h3>Horarios por día</h3>
                  <p>Define inicio, pausa, reanudación y fin para cada jornada.</p>
                </div>
                <span className="campaign-form__schedule-hint">
                  Todos los horarios usan el formato 24 hs.
                </span>
              </header>
              <div className="campaign-form__schedule-grid">
                <div className="campaign-form__schedule-title">Día</div>
                <div className="campaign-form__schedule-title">Activo</div>
                <div className="campaign-form__schedule-title">Inicio</div>
                <div className="campaign-form__schedule-title">Pausa</div>
                <div className="campaign-form__schedule-title">Reanudar</div>
                <div className="campaign-form__schedule-title">Fin</div>
                {DAY_OPTIONS.map(({ key, label }) => (
                  <div className="campaign-form__schedule-row" key={key}>
                    <div className="campaign-form__schedule-day">{label}</div>
                    <div className="campaign-form__toggle-cell">
                      <label
                        className="campaign-form__toggle"
                        htmlFor={`campaign-day-${key}`}
                        aria-label={`Alternar ${label}`}
                      >
                        <input
                          id={`campaign-day-${key}`}
                          type="checkbox"
                          className="campaign-form__toggle-input"
                          checked={values.schedule[key].enabled !== false}
                          onChange={(event) => handleDayToggle(key, event.target.checked)}
                        />
                        <span className="campaign-form__toggle-track" aria-hidden="true">
                          <span className="campaign-form__toggle-thumb" />
                        </span>
                      </label>
                    </div>
                    <div>
                      <input
                        type="time"
                        className="campaign-form__time"
                        value={values.schedule[key].start}
                        onChange={(event) => handleScheduleChange(key, 'start', event.target.value)}
                        required={values.schedule[key].enabled !== false}
                        disabled={values.schedule[key].enabled === false}
                      />
                    </div>
                    <div>
                      <input
                        type="time"
                        className="campaign-form__time"
                        value={values.schedule[key].pause}
                        onChange={(event) => handleScheduleChange(key, 'pause', event.target.value)}
                        required={values.schedule[key].enabled !== false}
                        disabled={values.schedule[key].enabled === false}
                      />
                    </div>
                    <div>
                      <input
                        type="time"
                        className="campaign-form__time"
                        value={values.schedule[key].resume}
                        onChange={(event) => handleScheduleChange(key, 'resume', event.target.value)}
                        required={values.schedule[key].enabled !== false}
                        disabled={values.schedule[key].enabled === false}
                      />
                    </div>
                    <div>
                      <input
                        type="time"
                        className="campaign-form__time"
                        value={values.schedule[key].end}
                        onChange={(event) => handleScheduleChange(key, 'end', event.target.value)}
                        required={values.schedule[key].enabled !== false}
                        disabled={values.schedule[key].enabled === false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <footer className="modal__footer">
            <button type="button" className="modal__button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="modal__button modal__button--primary"
              disabled={!hasSelectableChannels}
            >
              Guardar
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}