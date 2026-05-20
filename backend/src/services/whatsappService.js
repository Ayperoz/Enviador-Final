import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { isBoom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';

import { query, queryWarmup } from '../db/index.js';
import logger from '../logger.js';


import { Incoming } from '../services/incomingService.js';
import { normalizeUpsertToEntrantes } from '../services/baileysNormalizer.js';
import { notifyByEvent } from './notificationService.js';

const sessions = new Map();

const BAILEYS_DEBUG = process.env.BAILEYS_DEBUG === 'true';
const BAILEYS_LOG_LEVEL = process.env.NODE_ENV === 'production' ? 'error' : 'warn';
const CALENTADOR_PHONE = process.env.CALENTADOR ? process.env.CALENTADOR.trim() : '';
const WARMUP_MESSAGE = 'iniciar';
const DEFAULT_PRE_RESPONSES_LIMIT = 30;
const PRESENCE_WAIT_MS = 1_000;
const warmupConversationQueues = new Map();
let warmupTablesPromise = null;
const SUPPRESSED_ERROR_NAMES = new Set(['SessionError']);
const SUPPRESSED_MESSAGE_PATTERNS = [
  /failed to decrypt message/i,
  /no session record/i
];

function formatChannelLabel(channelId, channelName) {
  const name = channelName ? String(channelName).trim() : '';
  return name ? `Canal ${name}` : `Canal ${channelId}`;
}

let WA_VERSION;
async function getWaVersion() {
  if (!WA_VERSION) {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    WA_VERSION = version;
    logger.info(`Baileys: usando versión WA ${version.join('.')} (isLatest=${isLatest})`);
  }
  return WA_VERSION;
}



const LEVEL_MAP = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error'
};

function logChannelEvent(channelId, channelName, message, level = 'log') {
  const label = formatChannelLabel(channelId, channelName);
  const normalizedMessage = typeof message === 'string' ? message : '';
  const separator = normalizedMessage.startsWith(':') ? '' : ' ';
  const output = `backend - ${label}${separator}${normalizedMessage}`;
  const method = LEVEL_MAP[level] || 'info';
  if (typeof logger[method] === 'function') {
    logger[method](output);
  } else {
    logger.info(output);
  }
}

export function buildWhatsAppJid(phoneNumber, areaCode) {
  if (!phoneNumber) {
    return null;
  }

  const digits = normalisePhoneNumber(phoneNumber);
  if (!digits) {
    return null;
  }

  const prefix = normalisePhoneNumber(areaCode);
  const fullNumber = prefix && !digits.startsWith(prefix) ? `${prefix}${digits}` : digits;

  return `${fullNumber}@s.whatsapp.net`;
}

const CALENTADOR_JID = buildWhatsAppJid(CALENTADOR_PHONE);

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getMessageText(message = {}) {
  const root = message?.message || {};
  const unwrapped =
    root?.ephemeralMessage?.message ??
    root?.viewOnceMessageV2?.message ??
    root?.viewOnceMessage?.message ??
    root?.documentWithCaptionMessage?.message ??
    root;

  return (
    unwrapped?.conversation ||
    unwrapped?.extendedTextMessage?.text ||
    unwrapped?.interactiveMessage?.body?.text ||
    unwrapped?.buttonsMessage?.contentText ||
    unwrapped?.templateMessage?.hydratedTemplate?.hydratedContentText ||
    null
  );
}

function getRandomDelay(minSeconds, maxSeconds) {
  const min = Number(minSeconds);
  const max = Number(maxSeconds);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return 0;
  }
  const seconds = Math.floor(Math.random() * (max - min + 1)) + min;
  return seconds * 1000;
}

function getRandomWarmupQuestionId() {
  const configuredMaxId = Number.parseInt(process.env.cant_preResp, 10);
  const maxId = Number.isFinite(configuredMaxId) && configuredMaxId > 0
    ? configuredMaxId
    : DEFAULT_PRE_RESPONSES_LIMIT;

  return Math.floor(Math.random() * maxId) + 1;
}


async function pickRandomWarmupQuestion(tables) {
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const randomQuestionId = getRandomWarmupQuestionId();
    const lookup = await queryWarmup(
      `SELECT mensaje FROM ${tables.preguntas}
       WHERE id = $1 AND mensaje IS NOT NULL AND btrim(mensaje) <> ''
       LIMIT 1`,
      [randomQuestionId]
    );

    const text = (lookup.rows[0]?.mensaje || '').trim();
    if (text) {
      return text;
    }
  }

  const fallback = await queryWarmup(
    `SELECT mensaje FROM ${tables.preguntas}
     WHERE mensaje IS NOT NULL AND btrim(mensaje) <> ''
     ORDER BY RANDOM()
     LIMIT 1`
  );

  return (fallback.rows[0]?.mensaje || '').trim();
}

async function resolveWarmupTables() {
  if (warmupTablesPromise) {
    return warmupTablesPromise;
  }

  warmupTablesPromise = (async () => {
    const candidates = [
      { preguntas: 'cal1.preguntas1', respuestas: 'cal1.respuestas1' },
      { preguntas: 'public.preguntas1', respuestas: 'public.respuestas1' },
      { preguntas: 'preguntas1', respuestas: 'respuestas1' }
    ];

    for (const pair of candidates) {
      const { rows } = await queryWarmup(
        'SELECT to_regclass($1) AS preguntas, to_regclass($2) AS respuestas',
        [pair.preguntas, pair.respuestas]
      );
      if (rows[0]?.preguntas && rows[0]?.respuestas) {
        return pair;
      }
    }

    throw new Error('No se encontraron tablas de preguntas/respuestas del calentador');
  })().catch((error) => {
    warmupTablesPromise = null;
    throw error;
  });

  return warmupTablesPromise;
}

async function isWarmupEnabledForChannel(channelId) {
  const { rows } = await query('SELECT calentador FROM channels WHERE id = $1', [channelId]);
  return Boolean(rows[0]?.calentador);
}

async function processWarmupMessage(channelId, session, message) {
  if (!isSessionActive(channelId, session)) {
    return;
  }

  if (!message?.key || message.key.fromMe) {
    return;
  }

  const remoteJid = message.key.remoteJid || '';
  if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
    return;
  }

  const incomingText = (getMessageText(message) || '').trim();
  if (!incomingText) {
    return;
  }

  if (!(await isWarmupEnabledForChannel(channelId))) {
    return;
  }

  let tables;
  try {
    tables = await resolveWarmupTables();
  } catch (error) {
    logger.warn(`No se pudo resolver tablas del calentador para canal ${channelId}:`, error);
    return;
  }

  const questionLookup = await queryWarmup(
    `SELECT id FROM ${tables.preguntas} WHERE mensaje = $1 LIMIT 1`,
    [incomingText]
  );
  const questionId = questionLookup.rows[0]?.id;

  if (!questionId) {
    return;
  }

  const responseLookup = await queryWarmup(
    `SELECT mensaje FROM ${tables.respuestas} WHERE id = $1 LIMIT 1`,
    [questionId]
  );
  const responseText = (responseLookup.rows[0]?.mensaje || '').trim();
  if (!responseText) {
    return;
  }

  const initialDelayMs = getRandomDelay(process.env.CAL_TINICIAL, process.env.CAL_TMIN);
  if (initialDelayMs > 0) {
    await wait(initialDelayMs);
  }

  if (!isSessionActive(channelId, session)) {
    return;
  }

  await session.sock.sendMessage(remoteJid, { text: responseText });

  const followUpDelayMs = getRandomDelay(process.env.CAL_TMIN, process.env.CAL_TMAX);
  if (followUpDelayMs > 0) {
    await wait(followUpDelayMs);
  }

  if (!isSessionActive(channelId, session)) {
    return;
  }

  const randomQuestion = await pickRandomWarmupQuestion(tables);
  if (!randomQuestion) {
    return;
  }

  await session.sock.sendMessage(remoteJid, { text: randomQuestion });
}

function enqueueWarmupConversation(channelId, remoteJid, task) {
  const key = `${channelId}:${remoteJid}`;
  const previous = warmupConversationQueues.get(key) || Promise.resolve();
  const current = previous
    .then(task)
    .catch((error) => {
      logger.error(`Error en ciclo calentador para ${key}:`, error);
    })
    .finally(() => {
      if (warmupConversationQueues.get(key) === current) {
        warmupConversationQueues.delete(key);
      }
    });

  warmupConversationQueues.set(key, current);
}

function shouldSuppressLog(args) {
  if (BAILEYS_DEBUG) {
    return false;
  }

  const candidates = [];

  for (const arg of args) {
    if (!arg) {
      continue;
    }

    if (typeof arg === 'string') {
      candidates.push(arg);
      continue;
    }

    if (typeof arg === 'object') {
      const name = arg.name || arg.error?.name;
      if (name && SUPPRESSED_ERROR_NAMES.has(String(name))) {
        return true;
      }

      const maybeMessages = [arg.msg, arg.message, arg.error?.message];
      for (const message of maybeMessages) {
        if (typeof message === 'string') {
          candidates.push(message);
        }
      }
    }
  }

  return candidates.some((text) =>
    SUPPRESSED_MESSAGE_PATTERNS.some((pattern) => pattern.test(text))
  );
}

function attachSuppression(logInstance) {
  const originalError = logInstance.error.bind(logInstance);
  logInstance.error = (...args) => {
    if (shouldSuppressLog(args)) {
      return logInstance;
    }

    return originalError(...args);
  };

  const originalChild = logInstance.child.bind(logInstance);
  logInstance.child = (...childArgs) => {
    const childLogger = originalChild(...childArgs);
    return attachSuppression(childLogger);
  };

  return logInstance;
}

function createBaileysLogger(channelId) {
  const logInstance = pino({ level: BAILEYS_DEBUG ? 'debug' : BAILEYS_LOG_LEVEL }).child({ channelId });
  return attachSuppression(logInstance);
}

export const SESSION_STATES = {
  INITIALIZING: 'initializing',
  CONNECTING: 'connecting',
  QR_READY: 'qr_ready',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected'
};

const KEY_COLLECTIONS = [
  'preKeys',
  'sessions',
  'senderKeys',
  'appStateSyncKeys',
  'appStateVersions',
  'senderKeyMemory',
  'processedHistoryMessages'
];

function serializeKeyId(id) {
  if (typeof id === 'string') {
    return id;
  }

  if (typeof id === 'number') {
    return id.toString();
  }

  if (Buffer.isBuffer(id)) {
    return id.toString('base64');
  }

  if (id && typeof id === 'object') {
    if ('id' in id) {
      return serializeKeyId(id.id);
    }
    if ('keyId' in id) {
      return serializeKeyId(id.keyId);
    }
    return JSON.stringify(id, BufferJSON.replacer);
  }

  return String(id);
}

function normaliseKeyEntries(values) {
  if (!values) {
    return [];
  }

  if (values instanceof Map) {
    return Array.from(values.entries());
  }

  if (Array.isArray(values)) {
    return values;
  }

  return Object.entries(values);
}

async function updateChannelState(channelId, fields = {}) {
  const columnMap = {
    status: 'status',
    sessionState: 'session_state',
    phoneNumber: 'phone_number',
    qrCode: 'qr_code'
  };

  const columns = [];
  const values = [];
  let index = 1;

  for (const [field, column] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      const value = fields[field];
      if (typeof value !== 'undefined') {
        columns.push(`${column} = $${index}`);
        values.push(value);
        index += 1;
      }
    }
  }

  if (columns.length === 0) {
    return;
  }

  values.push(channelId);
  await query(`UPDATE channels SET ${columns.join(', ')} WHERE id = $${index}`, values);
}

async function loadPersistedSession(channelId) {
  const { rows } = await query('SELECT session_data FROM channels WHERE id = $1', [channelId]);
  const raw = rows[0]?.session_data;
  if (!raw) {
    return null;
  }

  const revived = JSON.parse(JSON.stringify(raw), BufferJSON.reviver);
  return {
    creds: revived.creds,
    keys: revived.keys || {}
  };
}

async function persistSession(channelId, state) {
  const payload = state
    ? JSON.parse(
      JSON.stringify(
        {
          creds: state.creds,
          keys: state.keys
        },
        BufferJSON.replacer
      )
    )
    : null;

  await query('UPDATE channels SET session_data = $2 WHERE id = $1', [channelId, payload]);
}

async function createDbAuthState(channelId) {
  const persisted = await loadPersistedSession(channelId);
  const storedKeys = persisted?.keys || {};

  KEY_COLLECTIONS.forEach((collection) => {
    if (!storedKeys[collection]) {
      storedKeys[collection] = {};
    }

    if (storedKeys[collection]['[object Object]']) {
      delete storedKeys[collection]['[object Object]'];
    }
  });

  // Reemplazar dentro de createDbAuthState:
  const state = {
    creds: persisted?.creds || initAuthCreds(),
    keys: {
      // Baileys llama get(type, ids[])
      get: async (type, ids) => {
        const collection = storedKeys[type] || {};
        const data = {};
        for (const id of ids) {
          const keyId = serializeKeyId(id);
          if (collection[keyId]) data[keyId] = collection[keyId];
        }
        return data;
      },

      // ✅ Baileys llama set(data) con un SOLO objeto
      //    { [type]: { [id]: value|null } }
      set: async (data) => {
        let mutated = false;
        for (const [type, entries] of Object.entries(data || {})) {
          if (!storedKeys[type]) storedKeys[type] = {};
          for (const [idRaw, value] of Object.entries(entries || {})) {
            const keyId = serializeKeyId(idRaw);
            if (value) {
              storedKeys[type][keyId] = value;
            } else {
              delete storedKeys[type][keyId];
            }
            mutated = true;
          }
        }
        if (mutated) {
          await persistSession(channelId, { creds: state.creds, keys: storedKeys });
        }
      },
    },
  };

  const saveCreds = async () => {
    await persistSession(channelId, { creds: state.creds, keys: storedKeys });
  };

  return { state, saveCreds };
}

export function normaliseJidUser(jid) {
  if (!jid) {
    return '';
  }

  const [user] = jid.split('@');
  const [number] = (user || '').split(':');
  return number ? number.replace(/[^0-9]/g, '') : '';
}

export function normalisePhoneNumber(value) {
  if (!value) {
    return '';
  }

  return String(value).replace(/[^0-9]/g, '');
}


async function fetchChannelDetails(channelId) {
  try {
    const { rows } = await query(
      'SELECT name, phone_number, area_code FROM channels WHERE id = $1',
      [channelId]
    );
    const name = rows[0]?.name || '';
    const phoneNumber = normalisePhoneNumber(rows[0]?.phone_number);
    const areaCode = normalisePhoneNumber(rows[0]?.area_code) || '549';
    return { name, phoneNumber, areaCode };
  } catch (error) {
    logger.warn(`No se pudieron obtener los datos del canal ${channelId}:`, error);
    return { name: '', phoneNumber: '', areaCode: '549' };
  }
}

function isSessionActive(channelId, session) {
  if (!session || sessions.get(channelId) !== session) {
    return false;
  }

  return Boolean(session.sock?.user);
}

async function sendWarmupPayload(session) {
  if (!CALENTADOR_JID) {
    throw new Error('Número CALENTADOR no configurado');
  }

  await session.sock.presenceSubscribe(CALENTADOR_JID).catch(() => { });
  await wait(PRESENCE_WAIT_MS);
  await session.sock.sendMessage(CALENTADOR_JID, { text: WARMUP_MESSAGE });
}

async function markWarmupCompleted(channelId) {
  try {
    await query('UPDATE channels SET warmup_enabled = FALSE WHERE id = $1', [channelId]);
  } catch (error) {
    logger.warn(`No se pudo actualizar el estado de calentador del canal ${channelId}:`, error);
  }
}

function resolveStatusCode(error) {
  if (!error) {
    return DisconnectReason.connectionClosed;
  }

  if (isBoom(error)) {
    return error.output.statusCode;
  }

  if (typeof error === 'object') {
    if ('output' in error && error.output?.statusCode) {
      return error.output.statusCode;
    }
    if ('statusCode' in error && error.statusCode) {
      return error.statusCode;
    }
    if ('code' in error && typeof error.code === 'number') {
      return error.code;
    }
  }

  return DisconnectReason.connectionClosed;
}

async function handleConnectionUpdate(channelId, session, update) {
  const { connection, lastDisconnect, qr } = update;

  try {
    if (qr) {
      const qrCode = await qrcode.toDataURL(qr);
      await updateChannelState(channelId, {
        qrCode,
        sessionState: SESSION_STATES.QR_READY,
        status: 'disconnected'
      });
      logChannelEvent(channelId, session.channelName, ': Generando QR');
    }

    if (connection === 'connecting') {
      //await updateChannelState(channelId, { status: 'connecting' });
      logChannelEvent(channelId, session.channelName, ': Vinculando...');
      return;
    }

    if (connection === 'open') {
      const jid = session.sock.user?.id || null;
      const phoneNumber = normaliseJidUser(jid);
      if (phoneNumber) session.channelPhone = phoneNumber;

      await updateChannelState(channelId, {
        status: 'connected',
        sessionState: SESSION_STATES.CONNECTED,
        phoneNumber,
        qrCode: null
      });

      try { await session.credsHandler(); } catch { }
      logChannelEvent(channelId, session.channelName, ': Vinculado correctamente');
      await notifyByEvent(
        'channelStarted',
        `Canal ${session.channelName || `Canal ${channelId}`} Vinculado correctamente!`
      );
      return;
    }


    if (connection === 'close') {
      const isActiveSession = sessions.get(channelId) === session;
      if (!isActiveSession) {
        return;
      }

      const statusCode = resolveStatusCode(lastDisconnect?.error);

      // Log de diagnóstico explícito:
      try {
        const err = lastDisconnect?.error;
        logger.warn(
          `Diagnóstico cierre canal ${channelId}: code=${statusCode} name=${err?.name} msg=${err?.message}`
        );
        if (err?.stack) logger.warn(err.stack);
      } catch { }
      const disconnectMessage = lastDisconnect?.error?.message || '';

      if (statusCode === DisconnectReason.loggedOut) {
        logChannelEvent(channelId, session.channelName, `: Sesión cerrada por el usuario (err ${statusCode})`, 'warn');
      } else if (statusCode) {
        const displayMessage = disconnectMessage || `err ${statusCode}`;
        logChannelEvent(channelId, session.channelName, `: Sesión cerrada (${displayMessage})`, 'warn');
      } else {
        logChannelEvent(channelId, session.channelName, ': Sesión cerrada', 'warn');
      }
      await notifyByEvent(
        'channelDisconnected',
        `Canal ${session.channelName || `Canal ${channelId}`} desvinculado.`
      );

      const shouldResetCredentials = statusCode === DisconnectReason.loggedOut;
      await updateChannelState(channelId, {
        status: shouldResetCredentials ? 'disconnected' : 'connecting',
        sessionState: shouldResetCredentials ? SESSION_STATES.DISCONNECTED : SESSION_STATES.INITIALIZING,
        phoneNumber: shouldResetCredentials ? null : undefined,
        qrCode: null
      });

      session.sock.ev.off('connection.update', session.connectionHandler);
      session.sock.ev.off('creds.update', session.credsHandler);

      try {
        session.sock.ws?.close();
      } catch (closeError) {
        logger.warn(`No se pudo cerrar la conexión WebSocket del canal ${channelId}:`, closeError);
      }

      sessions.delete(channelId);

      if (shouldResetCredentials) {
        await persistSession(channelId, null);
      }

      ensureChannelSession(channelId).catch((error) => {
        logger.error(`No se pudo reiniciar la sesión del canal ${channelId}:`, error);
      });
    }
  } catch (error) {
    logger.error(`Error procesando la sesión del canal ${channelId}:`, error);
  }
}

export async function sendWarmupMessageNow(channelId, { delayMs = 0 } = {}) {
  if (!CALENTADOR_JID) {
    throw new Error('Número CALENTADOR no configurado');
  }

  const session = sessions.get(channelId);

  if (!session) {
    throw new Error('Sesión de WhatsApp no disponible');
  }

  if (delayMs > 0) {
    await wait(delayMs);
  }

  if (!isSessionActive(channelId, session)) {
    throw new Error('El canal no está conectado');
  }

  await sendWarmupPayload(session);
  await markWarmupCompleted(channelId);
}

export async function getActiveChannelDispatchers(channelIds = []) {
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(
    new Set(
      channelIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );

  const dispatchers = [];

  for (const channelId of uniqueIds) {
    const session = sessions.get(channelId);

    if (!session || !isSessionActive(channelId, session) || !session.sock) {
      continue;
    }

    if (!session.channelName || !session.channelPhone || !session.areaCode) {
      try {
        const { name, phoneNumber, areaCode } = await fetchChannelDetails(channelId);
        if (name && !session.channelName) {
          session.channelName = name;
        }
        if (phoneNumber && !session.channelPhone) {
          session.channelPhone = phoneNumber;
        }
        if (areaCode && !session.areaCode) {
          session.areaCode = areaCode;
        }
      } catch (error) {
        logger.warn(`No se pudieron actualizar los datos del canal ${channelId}:`, error);
      }
    }

    const selfJid = session.sock.user?.id || null;
    const phone = normalisePhoneNumber(session.channelPhone) || normaliseJidUser(selfJid);
    if (phone && phone !== session.channelPhone) {
      session.channelPhone = phone;
    }

    session.areaCode = normalisePhoneNumber(session.areaCode) || '549';

    const dispatcher = {
      id: channelId,
      type: 'whatsapp',
      name: session.channelName || `Canal ${channelId}`,
      phone,
      jid: selfJid,
      areaCode: session.areaCode || '549',
      async isOnWhatsApp(jid) {
        try {
          const result = await session.sock.onWhatsApp(jid);
          if (Array.isArray(result)) {
            return result.some((entry) => entry?.exists);
          }
          return false;
        } catch (error) {
          logger.warn(`No se pudo verificar el número ${jid} en el canal ${channelId}:`, error);
          throw error;
        }
      },
      async sendText(jid, text) {
        return session.sock.sendMessage(jid, { text });
      }
    };

    dispatchers.push(dispatcher);
  }

  return dispatchers;
}

export async function ensureChannelSession(channelId) {
  if (sessions.has(channelId)) {
    const existingSession = sessions.get(channelId);

    if (existingSession) {
      try {
        const { name, phoneNumber, areaCode } = await fetchChannelDetails(channelId);
        if (name) {
          existingSession.channelName = name;
        }
        if (phoneNumber) {
          existingSession.channelPhone = phoneNumber;
        }
        if (areaCode) {
          existingSession.areaCode = areaCode;
        }
      } catch (error) {
        logger.warn(`No se pudo refrescar la sesión del canal ${channelId}:`, error);
      }

    }

    return existingSession;
  }

  const { name: channelName, phoneNumber: channelPhone, areaCode: channelAreaCode } = await fetchChannelDetails(channelId);

  const { state, saveCreds } = await createDbAuthState(channelId);
  const baileysLogger = createBaileysLogger(channelId);
  const version = await getWaVersion();
  const sock = makeWASocket({
    version, // <-- clave
    auth: state,
    printQRInTerminal: false,
    logger: baileysLogger,
    browser: ['Alt64 - Soluciones', 'Chrome', '1.0.0']
  });

  const session = {
    channelId,
    sock,
    connectionHandler: null,
    credsHandler: saveCreds,
    channelName,
    channelPhone,
    areaCode: channelAreaCode,
  };

  logChannelEvent(channelId, session.channelName, ': Inicializando sesión');

  const connectionHandler = (update) => handleConnectionUpdate(channelId, session, update);
  session.connectionHandler = connectionHandler;

  sock.ev.on('connection.update', connectionHandler);
  sock.ev.on('creds.update', saveCreds);


  sock.ev.on('messages.upsert', async (upsert) => {
    try {
      if (upsert?.type !== 'notify') return;

      const channelLabel = session.channelName || `Canal ${channelId}`;
      const dtos = normalizeUpsertToEntrantes({ sock, channelName: channelLabel, upsert });

      for (const dto of dtos) {
        await Incoming.store(dto);
      }

      for (const message of upsert.messages || []) {
        const remoteJid = message?.key?.remoteJid || '';
        if (!remoteJid) {
          continue;
        }
        enqueueWarmupConversation(channelId, remoteJid, () =>
          processWarmupMessage(channelId, session, message)
        );
      }
    } catch (err) {
      logger.error(`Error guardando entrantes del canal ${channelId}:`, err);
    }
  });


  sessions.set(channelId, session);

  await query(
    `UPDATE channels
     SET
       status = CASE
         WHEN status = 'connected' THEN status
         ELSE 'disconnected'
       END,
       session_state = CASE
         WHEN session_state = 'connected' THEN session_state
         ELSE $2
       END
     WHERE id = $1`,
    [channelId, SESSION_STATES.INITIALIZING]
  );

  return session;
}

async function shutdownSession(channelId) {
  const session = sessions.get(channelId);
  if (!session) {
    return;
  }

  sessions.delete(channelId);
  session.sock.ev.off('connection.update', session.connectionHandler);
  session.sock.ev.off('creds.update', session.credsHandler);

  try {
    await session.sock.logout();
  } catch (error) {
    logger.warn(`No se pudo cerrar la sesión del canal ${channelId}:`, error);
  }

  try {
    session.sock.ws?.close();
  } catch (error) {
    logger.warn(`No se pudo cerrar la conexión WebSocket del canal ${channelId}:`, error);
  }
}

export async function resetChannelSession(channelId) {
  const { name } = await fetchChannelDetails(channelId);
  logChannelEvent(channelId, name, ': Reiniciando sesión');
  await shutdownSession(channelId);
  await persistSession(channelId, null);
  await updateChannelState(channelId, {
    status: 'disconnected',
    sessionState: SESSION_STATES.INITIALIZING,
    phoneNumber: null,
    qrCode: null
  });
  await ensureChannelSession(channelId);
}

export async function removeChannelSession(channelId) {
  await shutdownSession(channelId);
  await persistSession(channelId, null);
}

export async function bootstrapWhatsAppSessions() {
  const { rows } = await query("SELECT id FROM channels WHERE channel_type = 'whatsapp' ORDER BY id");
  for (const row of rows) {
    try {
      await ensureChannelSession(row.id);
    } catch (error) {
      logger.error(`No se pudo inicializar la sesión del canal ${row.id}:`, error);
    }
  }
}
