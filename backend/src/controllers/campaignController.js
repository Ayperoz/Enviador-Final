import { query } from '../db/index.js';
import { startCampaignRunner, stopCampaignRunner } from '../services/campaignEngine.js';
import { getPositiveIntFromEnv } from '../utils/limits.js';
import logger from '../logger.js';

const DAY_DEFINITIONS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' }
];

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DISABLED_TIME = '00:00';
const ENVIOS_TABLES = Array.from({ length: 9 }, (_value, index) => `envios${index + 1}`);

const BASE_COUNT_SELECTS = ENVIOS_TABLES.map(
  (tableName, index) => `
    SELECT ${index + 1} AS base,
           COUNT(para) FILTER (WHERE estado IS NOT NULL) AS processed_count,
           COUNT(para) AS total_count
    FROM ${tableName}
  `
);

const BASE_COUNT_QUERY = `
  SELECT base, processed_count, total_count
  FROM (
${BASE_COUNT_SELECTS.join('\n    UNION ALL\n')}
  ) AS base_counts
`;

const CAMPAIGN_FIELDS = `
  c.id,
  c.name,
  c.channel_id AS "channelId",
  c.channel_ids AS "channelIds",
  c.min_delay AS "minDelay",
  c.max_delay AS "maxDelay",
  c.base,
  c.enabled,
  c.schedule,
  c.created_at AS "createdAt",
  COALESCE(channel_details.channels, '[]'::jsonb) AS "channelDetails"
`;

const CAMPAIGN_FROM_CLAUSE = `
  FROM campains c
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(channel_info), '[]'::jsonb) AS channels
    FROM (
      SELECT DISTINCT jsonb_build_object(
        'id', ch.id,
        'name', ch.name,
        'phoneNumber', ch.phone_number,
        'status', ch.status
      ) AS channel_info
      FROM unnest(COALESCE(c.channel_ids, ARRAY[]::INTEGER[])) AS cid(channel_id)
      JOIN channels ch ON ch.id = cid.channel_id
    ) AS channel_rows
  ) AS channel_details ON true
`;

const CAMPAIGN_SELECT = `
  SELECT ${CAMPAIGN_FIELDS}
  ${CAMPAIGN_FROM_CLAUSE}
  ORDER BY c.id DESC
`;

const CAMPAIGN_SELECT_ONE = `
  SELECT ${CAMPAIGN_FIELDS}
  ${CAMPAIGN_FROM_CLAUSE}
  WHERE c.id = $1
`;

function getCampaignLimit() {
  return getPositiveIntFromEnv('CANT_CAMPAINS');
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function sanitizeTime(value, dayLabel, fieldLabel) {
  if (typeof value !== 'string' || !TIME_REGEX.test(value)) {
    throw validationError(
      `Hora inválida para ${fieldLabel} (${dayLabel}). Usa el formato HH:MM.`
    );
  }
  return value;
}

function sanitizeSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') {
    throw validationError('La configuración de horarios es obligatoria.');
  }

  const sanitized = {};

  for (const { key, label } of DAY_DEFINITIONS) {
    const dayConfig = schedule[key];
    if (!dayConfig || typeof dayConfig !== 'object') {
      throw validationError(`Faltan los horarios para ${label}.`);
    }

    const isEnabled = dayConfig.enabled !== false;
    const start = dayConfig.start ?? DISABLED_TIME;
    const pause = dayConfig.pause ?? DISABLED_TIME;
    const resume = dayConfig.resume ?? DISABLED_TIME;
    const end = dayConfig.end ?? DISABLED_TIME;

    sanitized[key] = {
      enabled: isEnabled,
      start: isEnabled ? sanitizeTime(start, label, 'inicio') : TIME_REGEX.test(start) ? start : DISABLED_TIME,
      pause: isEnabled ? sanitizeTime(pause, label, 'pausa') : TIME_REGEX.test(pause) ? pause : DISABLED_TIME,
      resume: isEnabled ? sanitizeTime(resume, label, 'reanudar') : TIME_REGEX.test(resume) ? resume : DISABLED_TIME,
      end: isEnabled ? sanitizeTime(end, label, 'fin') : TIME_REGEX.test(end) ? end : DISABLED_TIME
    };
  }

  return sanitized;
}

function mapCampaignRow(row) {
  if (!row) {
    return null;
  }

  const { channelDetails, channelIds, channelids, ...rest } = row;
  const rawIds = Array.isArray(channelIds) ? channelIds : channelids || [];
  const normalizedIds = rawIds.map((value) => Number(value)).filter((value) => !Number.isNaN(value));

  return {
    ...rest,
    channelIds: normalizedIds,
    schedule: row.schedule || {},
    channels: Array.isArray(channelDetails) ? channelDetails : [],
    processedCount: 0,
    totalCount: 0
  };
}

function normalizeCountRow(row) {
  return {
    processedCount: Number(row?.processed_count ?? 0) || 0,
    totalCount: Number(row?.total_count ?? 0) || 0
  };
}

async function fetchBaseCountsMap() {
  const { rows } = await query(BASE_COUNT_QUERY);
  const map = new Map();

  rows.forEach((row) => {
    map.set(Number(row.base), normalizeCountRow(row));
  });

  return map;
}

async function fetchCountsForBase(base) {
  const numericBase = Number(base);
  if (!Number.isInteger(numericBase) || numericBase < 1 || numericBase > ENVIOS_TABLES.length) {
    return { processedCount: 0, totalCount: 0 };
  }

  const tableName = ENVIOS_TABLES[numericBase - 1];
  const { rows } = await query(
    `SELECT
       COUNT(para) FILTER (WHERE estado IS NOT NULL) AS processed_count,
       COUNT(para) AS total_count
     FROM ${tableName}`
  );

  return normalizeCountRow(rows[0]);
}

async function fetchCampaignById(id) {
  const numericId = Number(id);
  if (Number.isNaN(numericId)) {
    return null;
  }

  const { rows } = await query(CAMPAIGN_SELECT_ONE, [numericId]);
  const campaign = mapCampaignRow(rows[0]);
  if (!campaign) {
    return null;
  }

  const counts = await fetchCountsForBase(campaign.base);

  return {
    ...campaign,
    processedCount: counts.processedCount,
    totalCount: counts.totalCount
  };
}

export async function listCampaigns(_req, res) {
  try {
    const [campaignResult, baseCountsMap] = await Promise.all([
      query(CAMPAIGN_SELECT),
      fetchBaseCountsMap()
    ]);

    const campaigns = campaignResult.rows.map((row) => {
      const campaign = mapCampaignRow(row);
      if (!campaign) {
        return null;
      }

      const counts = baseCountsMap.get(Number(campaign.base)) || {
        processedCount: 0,
        totalCount: 0
      };

      return {
        ...campaign,
        processedCount: counts.processedCount,
        totalCount: counts.totalCount
      };
    });

    res.json(campaigns.filter(Boolean));
  } catch (error) {
    logger.error('Error fetching campaigns:', error);
    res.status(500).json({ message: 'No se pudieron obtener las campañas.' });
  }
}

async function ensureChannelsExist(channelIds) {
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    throw validationError('Selecciona al menos un canal.');
  }

  const numericIds = channelIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (numericIds.length !== channelIds.length) {
    throw validationError('Alguno de los canales seleccionados es inválido.');
  }

  const uniqueIds = Array.from(new Set(numericIds));
  const { rows } = await query('SELECT id FROM channels WHERE id = ANY($1::INTEGER[])', [uniqueIds]);

  if (rows.length !== uniqueIds.length) {
    throw validationError('Uno o más canales seleccionados no existen.');
  }

  return uniqueIds;
}

export async function createCampaign(req, res) {
  const { name, channelIds, channelId, minDelay, maxDelay, base, schedule } = req.body;

  try {
    if (!name || !name.trim()) {
      throw validationError('El nombre es obligatorio.');
    }

    const campaignLimit = getCampaignLimit();
    if (campaignLimit != null) {
      const { rows: countRows } = await query('SELECT COUNT(*)::INTEGER AS total FROM campains');
      const currentCount = Number(countRows[0]?.total ?? 0);
      if (currentCount >= campaignLimit) {
        throw validationError('Excedio el limite de campañas habilitadas');
      }
    }

    const channelsInput = channelIds ?? (channelId != null ? [channelId] : undefined);
    const validChannelIds = await ensureChannelsExist(channelsInput);
    const primaryChannelId = validChannelIds[0];

    const min = Number(minDelay);
    const max = Number(maxDelay);
    if (!Number.isFinite(min) || min <= 0) {
      throw validationError('El tiempo mínimo debe ser un número mayor a cero.');
    }
    if (!Number.isFinite(max) || max <= 0) {
      throw validationError('El tiempo máximo debe ser un número mayor a cero.');
    }
    if (min > max) {
      throw validationError('El tiempo mínimo no puede ser mayor que el máximo.');
    }

    const baseNumber = Number(base);
    if (!Number.isInteger(baseNumber) || baseNumber < 1 || baseNumber > 9) {
      throw validationError('La base debe ser un número entero entre 1 y 9.');
    }

    const sanitizedSchedule = sanitizeSchedule(schedule);

    const insertQuery = `
      INSERT INTO campains (name, channel_id, channel_ids, min_delay, max_delay, base, schedule, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
      RETURNING id;
    `;

    const { rows } = await query(insertQuery, [
      name.trim(),
      primaryChannelId,
      validChannelIds,
      min,
      max,
      baseNumber,
      sanitizedSchedule
    ]);

    const created = await fetchCampaignById(rows[0].id);
    res.status(201).json(created);
  } catch (error) {
    logger.error('Error creating campaign:', error);
    const status = error.statusCode || 500;
    const message = error.statusCode ? error.message : 'No se pudo crear la campaña.';
    res.status(status).json({ message });
  }
}

export async function updateCampaign(req, res) {
  const campaignId = Number(req.params.id);
  const { name, channelIds, channelId, minDelay, maxDelay, base, schedule } = req.body;

  try {
    if (Number.isNaN(campaignId)) {
      throw validationError('Identificador inválido.');
    }

    const existing = await fetchCampaignById(campaignId);
    if (!existing) {
      return res.status(404).json({ message: 'Campaña no encontrada.' });
    }

    if (!name || !name.trim()) {
      throw validationError('El nombre es obligatorio.');
    }

    await stopCampaignRunner(campaignId).catch((error) => {
      logger.error(`No se pudo detener la campaña ${campaignId} antes de actualizar:`, error);
    });

    const channelsInput = channelIds ?? (channelId != null ? [channelId] : undefined);
    const validChannelIds = await ensureChannelsExist(channelsInput);
    const primaryChannelId = validChannelIds[0];

    const min = Number(minDelay);
    const max = Number(maxDelay);
    if (!Number.isFinite(min) || min <= 0) {
      throw validationError('El tiempo mínimo debe ser un número mayor a cero.');
    }
    if (!Number.isFinite(max) || max <= 0) {
      throw validationError('El tiempo máximo debe ser un número mayor a cero.');
    }
    if (min > max) {
      throw validationError('El tiempo mínimo no puede ser mayor que el máximo.');
    }

    const baseNumber = Number(base);
    if (!Number.isInteger(baseNumber) || baseNumber < 1 || baseNumber > 9) {
      throw validationError('La base debe ser un número entero entre 1 y 9.');
    }

    const sanitizedSchedule = sanitizeSchedule(schedule);

    const updateQuery = `
      UPDATE campains
      SET name = $1,
          channel_id = $2,
          channel_ids = $3,
          min_delay = $4,
          max_delay = $5,
          base = $6,
          schedule = $7,
          enabled = FALSE
      WHERE id = $8;
    `;

    await query(updateQuery, [
      name.trim(),
      primaryChannelId,
      validChannelIds,
      min,
      max,
      baseNumber,
      sanitizedSchedule,
      campaignId
    ]);

    const updated = await fetchCampaignById(campaignId);
    res.json(updated);
  } catch (error) {
    logger.error('Error updating campaign:', error);
    const status = error.statusCode || 500;
    const message = error.statusCode ? error.message : 'No se pudo actualizar la campaña.';
    res.status(status).json({ message });
  }
}

export async function deleteCampaign(req, res) {
  const campaignId = Number(req.params.id);

  if (Number.isNaN(campaignId)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  try {
    await stopCampaignRunner(campaignId).catch((error) => {
      logger.error(`No se pudo detener la campaña ${campaignId} antes de eliminarla:`, error);
    });

    const existing = await fetchCampaignById(campaignId);
    if (!existing) {
      return res.status(404).json({ message: 'Campaña no encontrada.' });
    }

    await query('DELETE FROM campains WHERE id = $1', [campaignId]);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting campaign:', error);
    res.status(500).json({ message: 'No se pudo eliminar la campaña.' });
  }
}

export async function updateCampaignEnabled(req, res) {
  const campaignId = Number(req.params.id);
  const { enabled } = req.body;

  if (Number.isNaN(campaignId)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'El estado debe ser verdadero o falso.' });
  }

  try {
    const existing = await fetchCampaignById(campaignId);
    if (!existing) {
      return res.status(404).json({ message: 'Campaña no encontrada.' });
    }

    await query('UPDATE campains SET enabled = $1 WHERE id = $2', [enabled, campaignId]);

    if (enabled) {
      try {
        await startCampaignRunner(campaignId);
      } catch (runnerError) {
        logger.error(`No se pudo iniciar la campaña ${campaignId}:`, runnerError);
        await query('UPDATE campains SET enabled = FALSE WHERE id = $1', [campaignId]);
        const reverted = await fetchCampaignById(campaignId);
        return res.status(500).json({ message: 'No se pudo encender la campaña.', campaign: reverted });
      }
    } else {
      await stopCampaignRunner(campaignId).catch((error) => {
        logger.error(`No se pudo detener la campaña ${campaignId}:`, error);
      });
    }

    const updated = await fetchCampaignById(campaignId);
    res.json(updated);
  } catch (error) {
    logger.error('Error updating campaign status:', error);
    res.status(500).json({ message: 'No se pudo actualizar el estado de la campaña.' });
  }
}
