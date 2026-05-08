import logger from '../logger.js';
import { booleanToEnvValue, getBooleanFromEnv, getIntFromEnv, setEnvValue } from '../utils/envConfig.js';
import { syncChannelWarmers } from '../utils/channelWarmers.js';

const DEFAULT_PRE_RESPONSES_LIMIT = 30;

/**
 * Lee la configuración operativa desde variables de entorno y la devuelve normalizada.
 */
function normalizeSettings() {
  const channelLimit = getIntFromEnv('CANT_CHANNELS');
  let warmersLimit = getIntFromEnv('CANT_CALENTADORES', { allowZero: true });
  const campaignLimit = getIntFromEnv('CANT_CAMPAINS');
  const normalizer = getBooleanFromEnv('NORMALIZER_VISIBLE');
  const preResponsesLimit = getIntFromEnv('cant_preResp') ?? DEFAULT_PRE_RESPONSES_LIMIT;

  if (warmersLimit == null && channelLimit != null) {
    warmersLimit = channelLimit;
  }

  return {
    channelLimit: channelLimit ?? null,
    warmersLimit: warmersLimit ?? null,
    campaignLimit: campaignLimit ?? null,
    preResponsesLimit,
    normalizerEnabled: normalizer ?? false
  };
}

/**
 * Convierte un valor a entero validando reglas de obligatoriedad y rangos.
 */
function parseInteger(value, { allowZero = false, fieldName }) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`El campo ${fieldName} es obligatorio.`);
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`El campo ${fieldName} debe ser un número.`);
  }

  if (allowZero) {
    if (parsed < 0) {
      throw new Error(`El campo ${fieldName} no puede ser negativo.`);
    }
  } else if (parsed <= 0) {
    throw new Error(`El campo ${fieldName} debe ser mayor a cero.`);
  }

  return parsed;
}

/**
 * Entrega la configuración de límites y flags visibles en la pantalla de administración.
 */
export async function getSettings(_req, res) {
  try {
    const settings = normalizeSettings();
    return res.json(settings);
  } catch (error) {
    logger.error('Error obteniendo la configuración:', error);
    return res.status(500).json({ message: 'No se pudo obtener la configuración.' });
  }
}

/**
 * Guarda la configuración de límites en `.env` y sincroniza el estado de calentadores por canal.
 */
export async function updateSettings(req, res) {
  try {
    const channelLimit = parseInteger(req.body.channelLimit, {
      fieldName: 'cantidad de canales'
    });
    const warmersLimit = parseInteger(req.body.warmersLimit, {
      fieldName: 'cantidad de calentadores',
      allowZero: true
    });
    const campaignLimit = parseInteger(req.body.campaignLimit, {
      fieldName: 'cantidad de campañas'
    });
    const preResponsesLimit = parseInteger(req.body.preResponsesLimit, {
      fieldName: 'cantidad de preguntas aleatorias'
    });

    if (typeof req.body.normalizerEnabled !== 'boolean') {
      throw new Error('El campo normalizador debe ser verdadero o falso.');
    }

    if (warmersLimit > channelLimit) {
      throw new Error('La cantidad de calentadores no puede superar la cantidad de canales.');
    }

    await setEnvValue('CANT_CHANNELS', String(channelLimit));
    await setEnvValue('CANT_CALENTADORES', String(warmersLimit));
    await setEnvValue('CANT_CAMPAINS', String(campaignLimit));
    await setEnvValue('cant_preResp', String(preResponsesLimit));
    await setEnvValue('NORMALIZER_VISIBLE', booleanToEnvValue(req.body.normalizerEnabled));

    await syncChannelWarmers();

    const settings = normalizeSettings();
    return res.json(settings);
  } catch (error) {
    if (error.message && error.message.startsWith('El campo')) {
      return res.status(400).json({ message: error.message });
    }
    if (
      error.message ===
      'La cantidad de calentadores no puede superar la cantidad de canales.'
    ) {
      return res.status(400).json({ message: error.message });
    }

    logger.error('Error actualizando la configuración:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la configuración.' });
  }
}
