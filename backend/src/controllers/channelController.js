import { query } from '../db/index.js';
import { getPositiveIntFromEnv } from '../utils/limits.js';
import logger from '../logger.js';
import {
  ensureChannelSession,
  resetChannelSession,
  removeChannelSession,
  sendWarmupMessageNow,
  SESSION_STATES
} from '../services/whatsappService.js';
import {
  ensureTelegramSession,
  resetTelegramSession,
  removeTelegramSession,
  validateTelegramCredentials
} from '../services/telegramService.js';
import { syncChannelWarmers } from '../utils/channelWarmers.js';

const CHANNEL_FIELDS = `
  id,
  name,
  channel_type AS "channelType",
  phone_number AS "phoneNumber",
  area_code AS "areaCode",
  telegram_api_id AS "telegramApiId",
  telegram_api_hash AS "telegramApiHash",
  status,
  session_state AS "sessionState",
  warmup_enabled AS "warmupEnabled",
  calentador AS "calentador",
  created_at AS "createdAt"
`;

const CHANNEL_SELECT = `
  SELECT ${CHANNEL_FIELDS}
  FROM channels
  ORDER BY id DESC
`;

const CHANNEL_SELECT_ONE = `
  SELECT ${CHANNEL_FIELDS}
  FROM channels
  WHERE id = $1
`;

function getChannelLimit() {
  return getPositiveIntFromEnv('CANT_CHANNELS');
}

/**
 * Normaliza el código de área para guardarlo siempre en formato numérico.
 */
function normaliseAreaCode(value) {
  const digits = String(value ?? '')
    .replace(/[^0-9]/g, '')
    .slice(0, 10);
  return digits || '549';
}

async function fetchChannelById(id) {
  const numericId = Number(id);
  if (Number.isNaN(numericId)) {
    return null;
  }

  const { rows } = await query(CHANNEL_SELECT_ONE, [numericId]);
  return rows[0] || null;
}

/**
 * Devuelve la lista de canales ordenada por creación descendente.
 */
export async function listChannels(_req, res) {
  try {
    const { rows } = await query(CHANNEL_SELECT);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching channels:', error);
    res.status(500).json({ message: 'No se pudieron obtener los canales.' });
  }
}

/**
 * Crea un canal nuevo respetando límites configurados e inicializa su sesión de WhatsApp.
 */
export async function createChannel(req, res) {
  const { name, warmupEnabled, areaCode, channelType, apiId, apiHash } = req.body;
  const normalizedType = channelType === 'telegram' ? 'telegram' : 'whatsapp';

  const storedAreaCode = normaliseAreaCode(areaCode);

  if (!name) {
    return res.status(400).json({ message: 'El nombre del canal es obligatorio.' });
  }

  try {
    const channelLimit = getChannelLimit();
    if (channelLimit != null) {
      const { rows: countRows } = await query('SELECT COUNT(*)::INTEGER AS total FROM channels');
      const currentCount = Number(countRows[0]?.total ?? 0);
      if (currentCount >= channelLimit) {
        return res.status(400).json({ message: 'Excedio el limite de canales contratados' });
      }
    }

    if (normalizedType === 'telegram' && !validateTelegramCredentials(apiId, apiHash)) {
      return res
        .status(400)
        .json({ message: 'Api ID o Hash Incorrecto, por favor verifique los datos' });
    }

    const insertQuery = `
      INSERT INTO channels (name, warmup_enabled, area_code, channel_type, telegram_api_id, telegram_api_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;
    const { rows } = await query(insertQuery, [
      name,
      Boolean(warmupEnabled),
      storedAreaCode,
      normalizedType,
      normalizedType === 'telegram' ? String(apiId || '').trim() : null,
      normalizedType === 'telegram' ? String(apiHash || '').trim() : null
    ]);
    const created = rows[0];

    await query(
      `UPDATE channels
       SET status = 'disconnected',
           session_state = $2,
           qr_code = NULL
       WHERE id = $1`,
      [created.id, SESSION_STATES.INITIALIZING]
    );

    logger.info(`backend - Nuevo Canal Creado - Canal: "${name}" (ID: ${created.id})`);

    if (normalizedType === 'telegram') {
      await ensureTelegramSession(created.id);
    } else {
      await ensureChannelSession(created.id);
    }
    await syncChannelWarmers();

    const channel = await fetchChannelById(created.id);

    res.status(201).json(channel);
  } catch (error) {
    logger.error('Error creating channel:', error);
    res.status(500).json({ message: 'No se pudo crear el canal.' });
  }
}

/**
 * Actualiza los datos editables del canal y mantiene la sesión activa.
 */
export async function updateChannel(req, res) {
  const channelId = Number(req.params.id);
  const { name, warmupEnabled, areaCode, apiId, apiHash } = req.body;

  if (Number.isNaN(channelId)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  if (!name) {
    return res.status(400).json({ message: 'El nombre del canal es obligatorio.' });
  }

  try {
    const current = await fetchChannelById(channelId);
    if (!current) {
      return res.status(404).json({ message: 'Canal no encontrado.' });
    }

    const isTelegram = current.channelType === 'telegram';
    if (isTelegram && (apiId || apiHash) && !validateTelegramCredentials(apiId, apiHash)) {
      return res
        .status(400)
        .json({ message: 'Api ID o Hash Incorrecto, por favor verifique los datos' });
    }

    await query(
      `UPDATE channels
       SET name = $1,
           warmup_enabled = $2,
           area_code = $3,
           telegram_api_id = COALESCE($4, telegram_api_id),
           telegram_api_hash = COALESCE($5, telegram_api_hash)
       WHERE id = $6`,
      [
        name,
        Boolean(warmupEnabled),
        normaliseAreaCode(areaCode),
        isTelegram ? String(apiId || '').trim() || null : null,
        isTelegram ? String(apiHash || '').trim() || null : null,
        channelId
      ]
    );

    if (isTelegram) {
      await ensureTelegramSession(channelId);
    } else {
      await ensureChannelSession(channelId);
    }

    const channel = await fetchChannelById(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Canal no encontrado.' });
    }

    logger.info(`backend - Update Canal ${channel.name}`);

    res.json(channel);
  } catch (error) {
    logger.error('Error updating channel:', error);
    res.status(500).json({ message: 'No se pudo actualizar el canal.' });
  }
}

/**
 * Elimina un canal y limpia su sesión asociada.
 */
export async function deleteChannel(req, res) {
  const channelId = Number(req.params.id);

  if (Number.isNaN(channelId)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  try {
    const channel = await fetchChannelById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Canal no encontrado.' });
    }

    logger.info(`backend - Canal ${channel.name}: Eliminando`);

    if (channel.channelType === 'telegram') {
      await removeTelegramSession(channelId);
    } else {
      await removeChannelSession(channelId);
    }
    await query('DELETE FROM channels WHERE id = $1', [channelId]);
    await syncChannelWarmers();
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting channel:', error);
    res.status(500).json({ message: 'No se pudo eliminar el canal.' });
  }
}

/**
 * Fuerza la desconexión de la sesión de WhatsApp del canal indicado.
 */
export async function disconnectChannel(req, res) {
  const channelId = Number(req.params.id);

  if (Number.isNaN(channelId)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  try {
    const channel = await fetchChannelById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Canal no encontrado.' });
    }

    logger.info(`backend - Canal ${channel.name}: Desconectando`);

    if (channel.channelType === 'telegram') {
      await resetTelegramSession(channelId);
    } else {
      await resetChannelSession(channelId);
    }
    const updated = await fetchChannelById(channelId);

    res.json(updated);
  } catch (error) {
    logger.error('Error disconnecting channel:', error);
    res.status(500).json({ message: 'No se pudo desconectar el canal.' });
  }
}

/**
 * Regenera el QR reiniciando la sesión del canal.
 */
export async function regenerateQr(req, res) {
  const channelId = Number(req.params.id);

  if (Number.isNaN(channelId)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  try {
    const channel = await fetchChannelById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Canal no encontrado.' });
    }

    logger.info(`backend - Canal ${channel.name}: Generar nuevo QR solicitado`);

    if (channel.channelType === 'telegram') {
      await resetTelegramSession(channelId);
    } else {
      await resetChannelSession(channelId);
    }
    const updated = await fetchChannelById(channelId);

    res.json(updated);
  } catch (error) {
    logger.error('Error regenerating QR:', error);
    res.status(500).json({ message: 'No se pudo generar un nuevo QR.' });
  }
}

/**
 * Envía el mensaje inicial del calentador si el canal cumple condiciones de uso.
 */
export async function startWarmup(req, res) {
  const channelId = Number(req.params.id);

  if (Number.isNaN(channelId)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  try {
    const channel = await fetchChannelById(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Canal no encontrado.' });
    }

    if (!channel.calentador) {
      return res.status(403).json({ message: 'El calentador no está habilitado para este canal.' });
    }

    if (channel.channelType !== 'whatsapp') {
      return res.status(400).json({ message: 'El calentador solo está disponible para canales WhatsApp.' });
    }

    if (channel.sessionState !== SESSION_STATES.CONNECTED) {
      return res
        .status(409)
        .json({ message: 'El canal debe estar conectado para iniciar el calentador.' });
    }

    try {
      await sendWarmupMessageNow(channelId);
    } catch (error) {
      logger.error(`Error enviando el mensaje de calentador para el canal ${channelId}:`, error);

      if (error?.message === 'Número CALENTADOR no configurado') {
        return res.status(409).json({ message: 'El número del calentador no está configurado.' });
      }

      if (error?.message === 'El canal no está conectado') {
        return res.status(409).json({ message: 'El canal no está conectado.' });
      }

      if (error?.message === 'Sesión de WhatsApp no disponible') {
        return res
          .status(409)
          .json({ message: 'La sesión de WhatsApp del canal no está disponible.' });
      }

      return res.status(500).json({ message: 'No se pudo enviar el mensaje al calentador.' });
    }

    const updated = await fetchChannelById(channelId);
    res.json(updated);
  } catch (error) {
    logger.error('Error iniciando el calentador:', error);
    res.status(500).json({ message: 'No se pudo iniciar el calentador.' });
  }
}

/**
 * Obtiene el estado del QR/sesión para que el frontend muestre el flujo de conexión.
 */
export async function getQr(req, res) {
  const channelId = Number(req.params.id);

  if (Number.isNaN(channelId)) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  try {
    const channel = await fetchChannelById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Canal no encontrado.' });
    }

    const { rows } = await query(
      `SELECT qr_code, session_state AS "sessionState", status FROM channels WHERE id = $1`,
      [channelId]
    );
    const qrRow = rows[0];

    if (!qrRow) {
      return res.status(404).json({ message: 'Canal no encontrado.' });
    }

    if (qrRow.qr_code) {
      return res.json({ qrCode: qrRow.qr_code, status: SESSION_STATES.QR_READY });
    }

    if (qrRow.sessionState === SESSION_STATES.CONNECTED) {
      return res.json({ qrCode: null, status: SESSION_STATES.CONNECTED });
    }

    if (qrRow.sessionState === SESSION_STATES.CONNECTING) {
      return res.json({ qrCode: null, status: SESSION_STATES.CONNECTING });
    }

    if (qrRow.sessionState === SESSION_STATES.DISCONNECTED) {
      return res.json({ qrCode: null, status: SESSION_STATES.DISCONNECTED });
    }

    if (channel.channelType === 'telegram') {
      await ensureTelegramSession(channelId);
    } else {
      await ensureChannelSession(channelId);
    }

    return res.status(202).json({
      qrCode: null,
      status: qrRow.sessionState || SESSION_STATES.INITIALIZING
    });
  } catch (error) {
    if (error?.message === 'Api ID o Hash Incorrecto, por favor verifique los datos') {
      return res.status(400).json({ message: error.message });
    }
    logger.error('Error fetching QR:', error);
    res.status(500).json({ message: 'No se pudo obtener el código QR.' });
  }
}
