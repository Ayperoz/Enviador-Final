import { getClient, query } from '../db/index.js';
import {
  buildWhatsAppJid,
  getActiveChannelDispatchers,
  normalisePhoneNumber
} from './whatsappService.js';
import { getActiveTelegramDispatchers } from './telegramService.js';
import logger from '../logger.js';
import { logCampaignEvent } from './monitorService.js';
import { notifyByEvent } from './notificationService.js';

const ENVIOS_TABLES = Array.from({ length: 9 }, (_value, index) => `envios${index + 1}`);
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const STATUS_PENDING = 'PENDIENTE';
const STATUS_SENT = 'Enviado';
const STATUS_FAILED = 'No enviado';

const VALIDATION_WHATSAPP = 'WhatsApp';
const VALIDATION_TELEGRAM = 'Telegram';
const VALIDATION_NO_WHATSAPP = 'Sin Whatsapp';
const VALIDATION_NO_TELEGRAM = 'Sin Telegram';
const VALIDATION_INVALID_NUMBER = 'NUMERO INVALIDO';
const VALIDATION_ERROR = 'ERROR ENVIO';

const REPORT_TIMEZONE = 'America/Argentina/Buenos_Aires';

const runners = new Map();

function recordCampaignLog(runner, message, metadata = {}, level = 'info') {
  if (!runner) {
    return;
  }

  logCampaignEvent({
    campaignId: runner.id,
    campaignName: runner.name,
    message,
    level,
    metadata
  });
}

function getEnviosTableName(base) {
  const numeric = Number(base);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > ENVIOS_TABLES.length) {
    throw new Error('La base configurada es inválida.');
  }

  return ENVIOS_TABLES[numeric - 1];
}

function clampString(value, maxLength) {
  if (value == null) {
    return null;
  }

  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength);
}

function randomInt(min, max) {
  const from = Math.ceil(min);
  const to = Math.floor(max);
  const span = to - from + 1;
  if (span <= 0) {
    return Math.max(from, 0);
  }
  return Math.floor(Math.random() * span) + from;
}

function minutesFromTime(value) {
  if (typeof value !== 'string') {
    return 0;
  }

  const [hours, minutes] = value.split(':').map((part) => Number(part));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

function isDayEnabled(dayConfig) {
  if (!dayConfig || dayConfig.enabled === false) {
    return false;
  }

  const times = [dayConfig.start, dayConfig.pause, dayConfig.resume, dayConfig.end];
  return times.some((time) => typeof time === 'string' && time !== '00:00');
}

function computeWaitUntilNextEnabled(schedule, now) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(now.getTime());
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + offset);

    const dayKey = DAY_KEYS[candidate.getDay()];
    const dayConfig = schedule?.[dayKey];
    if (!isDayEnabled(dayConfig)) {
      continue;
    }

    const startMinutes = minutesFromTime(dayConfig.start);
    const target = new Date(candidate.getTime());
    target.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

    const waitMs = target.getTime() - now.getTime();
    if (waitMs > 0) {
      return waitMs;
    }
  }

  return 60 * 60 * 1000; // 1 hora de respaldo
}

function evaluateSchedule(schedule, now = new Date()) {
  const dayKey = DAY_KEYS[now.getDay()];
  const dayConfig = schedule?.[dayKey];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (!isDayEnabled(dayConfig)) {
    return { canSend: false, waitMs: computeWaitUntilNextEnabled(schedule, now) };
  }

  const start = minutesFromTime(dayConfig.start);
  const pause = minutesFromTime(dayConfig.pause);
  const resume = minutesFromTime(dayConfig.resume);
  const end = minutesFromTime(dayConfig.end);

  if (currentMinutes < start) {
    return { canSend: false, waitMs: (start - currentMinutes) * 60 * 1000 };
  }

  if (currentMinutes <= pause) {
    return { canSend: true };
  }

  if (currentMinutes < resume) {
    return { canSend: false, waitMs: (resume - currentMinutes) * 60 * 1000 };
  }

  if (currentMinutes <= end) {
    return { canSend: true };
  }

  return { canSend: false, waitMs: computeWaitUntilNextEnabled(schedule, now) };
}

function delayWithSignal(signal, ms) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve(true);
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', onAbort);
      resolve(false);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function ensureProductiveWindow(runner) {
  const { signal } = runner.controller;

  while (!signal.aborted) {
    const evaluation = evaluateSchedule(runner.schedule, new Date());
    if (evaluation.canSend) {
      return true;
    }

    const waitMs = evaluation.waitMs ?? 60_000;
    const waited = await delayWithSignal(signal, waitMs);
    if (!waited) {
      return false;
    }
  }

  return false;
}

async function reserveNextRows(runner, count) {
  if (count <= 0) {
    return [];
  }

  const tableName = getEnviosTableName(runner.base);
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const selectQuery = `
      SELECT id, para, mensaje
      FROM ${tableName}
      WHERE estado IS NULL
      ORDER BY id ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `;
    const { rows } = await client.query(selectQuery, [count]);
    const ids = rows.map((row) => row.id);

    if (ids.length > 0) {
      await client.query(
        `UPDATE ${tableName}
         SET estado = $2,
             validacion = NULL,
             campania = $3,
             fecha = (CURRENT_TIMESTAMP AT TIME ZONE '${REPORT_TIMEZONE}')::DATE,
             hora = DATE_TRUNC('second', (CURRENT_TIMESTAMP AT TIME ZONE '${REPORT_TIMEZONE}'))::TIME
         WHERE id = ANY($1::INT[])`,
        [ids, STATUS_PENDING, runner.campaignLabel]
      );
    }

    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deactivateCampaign(runner, reason) {
  if (runner.disabled) {
    return true;
  }

  runner.disabled = true;

  try {
    await query('UPDATE campains SET enabled = FALSE WHERE id = $1', [runner.id]);
    logger.info(`Campaña ${runner.id} desactivada: ${reason}`);
  } catch (error) {
    logger.error(`No se pudo desactivar la campaña ${runner.id}:`, error);
  }

  runner.controller.abort();
  return true;
}

async function markOutcome(runner, rowId, channel, estado, validacion) {
  const tableName = getEnviosTableName(runner.base);
  const canal = clampString(channel?.name ?? `Canal ${channel?.id ?? ''}`, 20);
  const desde = clampString(channel?.phone ?? '', 50);
  const campania = runner.campaignLabel;
  const validationText = clampString(validacion, 50);

  await query(
    `UPDATE ${tableName}
     SET estado = $2,
         validacion = $3,
         canal = $4,
         campania = $5,
         fecha = (CURRENT_TIMESTAMP AT TIME ZONE '${REPORT_TIMEZONE}')::DATE,
         hora = DATE_TRUNC('second', (CURRENT_TIMESTAMP AT TIME ZONE '${REPORT_TIMEZONE}'))::TIME,
         desde = NULLIF($6, '')
     WHERE id = $1`,
    [rowId, estado, validationText, canal, campania, desde]
  );
}

async function processRow(runner, channel, row, waitPromise = Promise.resolve(true)) {
  const { signal } = runner.controller;
  if (signal.aborted) {
    return;
  }

  const campaignName = runner.name ?? runner.campaignLabel;
  const channelName = channel?.name ?? `Canal ${channel?.id ?? ''}`;
  const sender = channel?.phone ?? channel?.jid ?? 'Desconocido';
  const recipient = row?.para ?? '';
  const messageText = row?.mensaje ?? '';

  const phoneDigits = normalisePhoneNumber(row?.para);
  if (!phoneDigits) {
    await markOutcome(runner, row.id, channel, STATUS_FAILED, VALIDATION_INVALID_NUMBER);
    return;
  }

  const isTelegramChannel = channel?.type === 'telegram';
  const areaDigits = normalisePhoneNumber(channel?.areaCode) || '549';
  const jid = isTelegramChannel ? phoneDigits : buildWhatsAppJid(phoneDigits, areaDigits);
  if (!jid) {
    await markOutcome(runner, row.id, channel, STATUS_FAILED, VALIDATION_INVALID_NUMBER);
    return;
  }

  let exists;
  try {
    exists = await channel.isOnWhatsApp(jid);
  } catch (error) {
    logger.error(`No se pudo verificar el número ${phoneDigits} para la campaña ${runner.id}:`, error);
    await markOutcome(
      runner,
      row.id,
      channel,
      STATUS_FAILED,
      `${VALIDATION_ERROR} - ${clampString(error?.message ?? 'Verificación', 30)}`
    );
    return;
  }

  if (!exists) {
    const validationNoChannel = isTelegramChannel ? VALIDATION_NO_TELEGRAM : VALIDATION_NO_WHATSAPP;
    logger.info(`Mensaje no enviado - ${phoneDigits} ${validationNoChannel} - Canal: ${channelName}`);
    recordCampaignLog(runner, `Mensaje no enviado - ${phoneDigits} ${validationNoChannel} - Canal: ${channelName}`, {
      type: 'not_sent',
      phone: phoneDigits,
      channel: channelName
    });
    await markOutcome(runner, row.id, channel, STATUS_FAILED, validationNoChannel);
    return;
  }

  const waited = await waitPromise;
  if (!waited) {
    return;
  }

  const productive = await ensureProductiveWindow(runner);
  if (!productive) {
    return;
  }

  if (signal.aborted) {
    return;
  }

  try {
    logger.info(
      `Campaña: ${campaignName} - Enviando mensaje al: ${recipient}, desde: ${sender} Canal: ${channelName}, Mensaje: - ${messageText}`
    );
    recordCampaignLog(
      runner,
      `Campaña: ${campaignName} - Enviando mensaje al: ${recipient}, desde: ${sender} Canal: ${channelName}, Mensaje: - ${messageText}`,
      {
        type: 'sending',
        phone: recipient,
        channel: channelName,
        sender,
        message: messageText
      }
    );

    const sendResult = await channel.sendText(jid, row?.mensaje ?? '');
    const messageId = sendResult?.key?.id;

    if (!messageId) {
      throw new Error('WhatsApp no devolvió identificador de mensaje.');
    }

    await markOutcome(
      runner,
      row.id,
      channel,
      STATUS_SENT,
      isTelegramChannel ? VALIDATION_TELEGRAM : VALIDATION_WHATSAPP
    );
    logger.info(`Mensaje aceptado por WhatsApp - ${phoneDigits} OK - Canal: ${channelName}`);
    recordCampaignLog(runner, `Mensaje aceptado por WhatsApp - ${phoneDigits} OK - Canal: ${channelName}`, {
      type: 'sent',
      phone: phoneDigits,
      channel: channelName
    });
  } catch (error) {
    logger.error(`Error enviando mensaje para campaña ${runner.id}:`, error);
    await markOutcome(runner, row.id, channel, STATUS_FAILED, `${VALIDATION_ERROR} - ${clampString(error?.message ?? 'Desconocido', 30)}`);
    recordCampaignLog(
      runner,
      `Mensaje no enviado - ${phoneDigits} ERROR - Canal: ${channelName}`,
      {
        type: 'error',
        phone: phoneDigits,
        channel: channelName,
        error: error?.message
      },
      'error'
    );
  }
}

async function clearPendingRows(runner) {
  const tableName = getEnviosTableName(runner.base);
  await query(
    `UPDATE ${tableName}
     SET estado = NULL,
         validacion = NULL,
         campania = NULL,
         canal = NULL,
         desde = NULL,
         fecha = NULL,
         hora = NULL
     WHERE estado = $1 AND campania = $2`,
    [STATUS_PENDING, runner.campaignLabel]
  );
}

async function loadCampaignConfig(campaignId) {
  const { rows } = await query(
    `SELECT id, name, channel_ids, min_delay, max_delay, base, schedule, enabled
     FROM campains
     WHERE id = $1`,
    [campaignId]
  );

  const campaign = rows[0];
  if (!campaign) {
    return null;
  }

  const channelIds = Array.isArray(campaign.channel_ids)
    ? campaign.channel_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value))
    : [];

  return {
    id: campaign.id,
    name: campaign.name,
    channelIds,
    minDelay: Number(campaign.min_delay),
    maxDelay: Number(campaign.max_delay),
    base: Number(campaign.base),
    schedule: campaign.schedule || {},
    enabled: campaign.enabled === true
  };
}

function createRunner(config) {
  const controller = new AbortController();
  return {
    id: config.id,
    name: config.name,
    campaignLabel: clampString(config.name ?? `Campaña ${config.id}`, 100),
    channelIds: config.channelIds,
    minDelay: config.minDelay,
    maxDelay: config.maxDelay,
    base: config.base,
    schedule: config.schedule || {},
    controller,
    loopPromise: null,
    disabled: false
  };
}

async function runCampaignLoop(runner) {
  const { signal } = runner.controller;

  while (!signal.aborted) {
    const canWork = await ensureProductiveWindow(runner);
    if (!canWork) {
      break;
    }

    if (signal.aborted) {
      break;
    }

    const [whatsappDispatchers, telegramDispatchers] = await Promise.all([
      getActiveChannelDispatchers(runner.channelIds),
      getActiveTelegramDispatchers(runner.channelIds)
    ]);
    const dispatchers = [...whatsappDispatchers, ...telegramDispatchers];
    if (dispatchers.length === 0) {
      await deactivateCampaign(runner, 'sin canales vinculados activos');
      break;
    }

    let rows;
    try {
      rows = await reserveNextRows(runner, dispatchers.length);
    } catch (error) {
      logger.error(`No se pudieron reservar datos para la campaña ${runner.id}:`, error);
      const waited = await delayWithSignal(signal, 10000);
      if (!waited) {
        break;
      }
      continue;
    }

    if (!rows || rows.length === 0) {
      await deactivateCampaign(runner, 'sin datos pendientes para procesar');
      break;
    }

    const waitSeconds = randomInt(runner.minDelay, runner.maxDelay);
    const waitMs = Math.max(waitSeconds, 0) * 1000;
    if (waitSeconds > 0) {
      logger.info(`Aguardando ${waitSeconds} segundos para continuar `);
      recordCampaignLog(runner, `Aguardando ${waitSeconds} segundos para continuar `, {
        type: 'delay',
        seconds: waitSeconds
      });
    }
    const waitPromise = waitMs > 0 ? delayWithSignal(signal, waitMs) : Promise.resolve(true);

    const tasks = rows.slice(0, dispatchers.length).map((row, index) =>
      processRow(runner, dispatchers[index], row, waitPromise)
    );

    try {
      await Promise.all(tasks);
    } catch (error) {
      logger.error(`Error procesando lote de la campaña ${runner.id}:`, error);
    }

    const waited = await waitPromise;
    if (!waited) {
      break;
    }
  }

  const campaignName = runner.name ?? runner.campaignLabel;
  const completionMessage = `Campaña "${campaignName}" Finalizada`;
  logger.info(completionMessage);
  await notifyByEvent('campaignFinished', `Campaña *${campaignName}* finalizada correctamente!`);
  recordCampaignLog(runner, completionMessage, { type: 'completed' });
}

export async function startCampaignRunner(campaignId) {
  const config = await loadCampaignConfig(campaignId);
  if (!config) {
    throw new Error('Campaña no encontrada.');
  }

  if (!config.enabled) {
    return;
  }

  if (!Array.isArray(config.channelIds) || config.channelIds.length === 0) {
    throw new Error('La campaña no tiene canales asignados.');
  }

  if (runners.has(campaignId)) {
    await stopCampaignRunner(campaignId);
  }

  const runner = createRunner(config);
  await notifyByEvent('campaignStarted', `Campaña ${config.name} iniciada!`);

  await clearPendingRows(runner).catch((error) => {
    logger.warn(`No se pudieron limpiar registros pendientes de la campaña ${runner.id}:`, error);
  });

  runner.loopPromise = runCampaignLoop(runner)
    .catch((error) => {
      logger.error(`La campaña ${runner.id} finalizó con errores:`, error);
    })
    .finally(async () => {
      runners.delete(campaignId);
      if (runner.disabled) {
        try {
          await clearPendingRows(runner);
        } catch (error) {
          logger.warn(`No se pudieron limpiar registros pendientes al finalizar la campaña ${runner.id}:`, error);
        }
      }
    });

  runners.set(campaignId, runner);
}

export async function stopCampaignRunner(campaignId) {
  const runner = runners.get(campaignId);

  if (runner) {
    runner.controller.abort();
    try {
      await runner.loopPromise;
    } catch (error) {
      logger.error(`Error esperando a que detenga la campaña ${campaignId}:`, error);
    }
    runners.delete(campaignId);
    await clearPendingRows(runner).catch((error) => {
      logger.warn(`No se pudieron liberar registros pendientes de la campaña ${campaignId}:`, error);
    });
    return;
  }

  const config = await loadCampaignConfig(campaignId);
  if (config) {
    const tempRunner = createRunner(config);
    await clearPendingRows(tempRunner).catch((error) => {
      logger.warn(`No se pudieron limpiar registros pendientes de la campaña ${campaignId}:`, error);
    });
  }
}

export async function initializeCampaignEngine() {
  const { rows } = await query('SELECT id FROM campains WHERE enabled = TRUE');

  for (const row of rows) {
    try {
      await startCampaignRunner(row.id);
    } catch (error) {
      logger.error(`No se pudo iniciar la campaña ${row.id}:`, error);
    }
  }
}
