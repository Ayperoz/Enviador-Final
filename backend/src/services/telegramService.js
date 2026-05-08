import qrcode from 'qrcode';
import { query } from '../db/index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { notifyByEvent } from './notificationService.js';

const SESSION_STATES = {
  INITIALIZING: 'initializing',
  QR_READY: 'qr_ready',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected'
};

const telegramSessions = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isValidApiId(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function isValidApiHash(value) {
  return /^[a-fA-F0-9]{16,}$/.test(String(value || '').trim());
}

function getSessionDirectory(channelId) {
  return path.resolve(__dirname, '../../sessions/telegram', String(channelId));
}

async function getChannelData(channelId) {
  const { rows } = await query(
    `SELECT id, name, telegram_api_id AS "apiId", telegram_api_hash AS "apiHash"
     FROM channels
     WHERE id = $1`,
    [channelId]
  );

  return rows[0] || null;
}

async function loadTelegramSdk() {
  const telegramModule = await import('telegram');
  let sessionsModule;
  try {
    sessionsModule = await import('telegram/sessions/index.js');
  } catch {
    sessionsModule = await import('telegram/sessions');
  }

  return {
    TelegramClient: telegramModule.TelegramClient,
    Api: telegramModule.Api,
    StringSession: sessionsModule.StringSession
  };
}

async function buildTelegramClient(channelId, apiId, apiHash) {
  const { TelegramClient, StringSession } = await loadTelegramSdk();

  const sessionDir = getSessionDirectory(channelId);
  await fs.mkdir(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, 'session.txt');
  const stringSession = await fs.readFile(sessionPath, 'utf8').catch(() => '');

  const client = new TelegramClient(new StringSession(stringSession || ''), Number(apiId), String(apiHash), {
    connectionRetries: 5
  });

  await client.connect();
  return { client, sessionPath };
}

async function ensureTelegramClientSession(row) {
  const current = telegramSessions.get(row.id);
  if (current?.client) {
    return current;
  }

  if (!validateTelegramCredentials(row.apiId, row.apiHash)) {
    return null;
  }

  const { client, sessionPath } = await buildTelegramClient(row.id, row.apiId, row.apiHash);
  const authorized = await client.checkAuthorization().catch(() => false);
  if (!authorized) {
    await client.disconnect().catch(() => {});
    return null;
  }

  const entry = {
    client,
    sessionPath,
    apiId: row.apiId,
    apiHash: row.apiHash,
    abortController: new AbortController()
  };
  telegramSessions.set(row.id, entry);
  return entry;
}

async function persistTelegramCredentials(channelId, apiId, apiHash) {
  const sessionDir = getSessionDirectory(channelId);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(sessionDir, 'telegram_api_id.txt'), String(apiId), 'utf8');
  await fs.writeFile(path.join(sessionDir, 'telegram_api_hash.txt'), String(apiHash), 'utf8');
}

async function markConnected(channelId, client, sessionPath) {
  const channel = await getChannelData(channelId);
  const channelName = channel?.name || `Canal ${channelId}`;
  const me = await client.getMe().catch(() => null);
  const phone = me?.phone ? String(me.phone) : null;

  await fs.writeFile(sessionPath, client.session.save(), 'utf8');
  await query(
    `UPDATE channels
     SET status = 'connected',
         session_state = $2,
         qr_code = NULL,
         phone_number = COALESCE($3, phone_number)
     WHERE id = $1`,
    [channelId, SESSION_STATES.CONNECTED, phone]
  );
  await notifyByEvent('channelStarted', `Canal ${channelName} Vinculado correctamente!`);
}

async function startQrSignIn(channelId, client, apiId, apiHash, sessionPath, abortSignal) {
  let firstQrResolved = false;
  let resolveFirstQr;
  const firstQrPromise = new Promise((resolve) => {
    resolveFirstQr = resolve;
  });

  const signInPromise = client.signInUserWithQrCode({ apiId: Number(apiId), apiHash: String(apiHash) }, {
    qrCode: async ({ token }) => {
      if (abortSignal.aborted) {
        throw new Error('TELEGRAM_SIGNIN_ABORTED');
      }

      const qrText = `tg://login?token=${token.toString('base64url')}`;
      const qrDataUrl = await qrcode.toDataURL(qrText);

      await query(
        `UPDATE channels
         SET status = 'disconnected',
             session_state = $2,
             qr_code = $3
         WHERE id = $1`,
        [channelId, SESSION_STATES.QR_READY, qrDataUrl]
      );

      if (!firstQrResolved) {
        firstQrResolved = true;
        resolveFirstQr();
      }
    },
    onError: async () => true
  });

  await firstQrPromise;

  signInPromise
    .then(async () => {
      if (abortSignal.aborted) {
        return;
      }
      await markConnected(channelId, client, sessionPath);
    })
    .catch(async (error) => {
      if (abortSignal.aborted || error?.message === 'TELEGRAM_SIGNIN_ABORTED') {
        return;
      }

      await query(
        `UPDATE channels
         SET status = 'disconnected',
             session_state = $2
         WHERE id = $1`,
        [channelId, SESSION_STATES.DISCONNECTED]
      );
      throw error;
    });
}

export function validateTelegramCredentials(apiId, apiHash) {
  return isValidApiId(apiId) && isValidApiHash(apiHash);
}

export async function ensureTelegramSession(channelId) {
  const channel = await getChannelData(channelId);
  if (!channel) {
    throw new Error('Canal no encontrado.');
  }

  if (!validateTelegramCredentials(channel.apiId, channel.apiHash)) {
    await query(
      `UPDATE channels
       SET status = 'disconnected',
           session_state = $2,
           qr_code = NULL
       WHERE id = $1`,
      [channelId, SESSION_STATES.DISCONNECTED]
    );
    throw new Error('Api ID o Hash Incorrecto, por favor verifique los datos');
  }

  await persistTelegramCredentials(channelId, channel.apiId, channel.apiHash);

  const existing = telegramSessions.get(channelId);
  if (existing?.client) {
    existing.abortController.abort();
    await existing.client.disconnect().catch(() => {});
  }

  const { client, sessionPath } = await buildTelegramClient(channelId, channel.apiId, channel.apiHash);
  const abortController = new AbortController();

  telegramSessions.set(channelId, {
    client,
    sessionPath,
    apiId: channel.apiId,
    apiHash: channel.apiHash,
    abortController
  });

  const authorized = await client.checkAuthorization();

  if (authorized) {
    await markConnected(channelId, client, sessionPath);
    return;
  }

  await startQrSignIn(
    channelId,
    client,
    channel.apiId,
    channel.apiHash,
    sessionPath,
    abortController.signal
  );
}

export async function resetTelegramSession(channelId) {
  await query(
    `UPDATE channels
     SET status = 'disconnected',
         session_state = $2,
         qr_code = NULL
     WHERE id = $1`,
    [channelId, SESSION_STATES.INITIALIZING]
  );

  await ensureTelegramSession(channelId);
}

export async function removeTelegramSession(channelId) {
  const channel = await getChannelData(channelId);
  const channelName = channel?.name || `Canal ${channelId}`;
  const session = telegramSessions.get(channelId);
  if (session?.client) {
    session.abortController.abort();
    await fs.writeFile(session.sessionPath, session.client.session.save(), 'utf8').catch(() => {});
    await session.client.disconnect().catch(() => {});
  }

  telegramSessions.delete(channelId);

  await query(
    `UPDATE channels
     SET qr_code = NULL,
         session_state = $2,
         status = 'disconnected'
     WHERE id = $1`,
    [channelId, SESSION_STATES.DISCONNECTED]
  );
  await notifyByEvent('channelDisconnected', `Canal ${channelName} desvinculado.`);
}

export async function getActiveTelegramDispatchers(channelIds = []) {
  const ids = (Array.isArray(channelIds) ? channelIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (ids.length === 0) {
    return [];
  }

  const { rows } = await query(
    `SELECT id, name, phone_number, area_code, telegram_api_id AS "apiId", telegram_api_hash AS "apiHash"
     FROM channels
     WHERE id = ANY($1::INT[]) AND channel_type = 'telegram'`,
    [ids]
  );

  const dispatchers = [];
  for (const row of rows) {
    const session = await ensureTelegramClientSession(row);
    if (!session?.client) {
      continue;
    }

    const { Api } = await loadTelegramSdk();
    const recipientCache = new Map();
    const areaDigits = String(row.area_code || '').replace(/[^0-9]/g, '');

    const resolveEntity = async (rawJid) => {
      const key = String(rawJid || '');
      if (!key) {
        return null;
      }

      if (recipientCache.has(key)) {
        return recipientCache.get(key);
      }

      const onlyDigits = key.replace(/[^0-9]/g, '');
      const phoneDigits = areaDigits && !onlyDigits.startsWith(areaDigits)
        ? `${areaDigits}${onlyDigits}`
        : onlyDigits;

      if (!phoneDigits) {
        recipientCache.set(key, null);
        return null;
      }

      try {
        const entity = await session.client.getInputEntity(phoneDigits);
        recipientCache.set(key, entity);
        return entity;
      } catch {
        try {
          const imported = await session.client.invoke(
            new Api.contacts.ImportContacts({
              contacts: [
                new Api.InputPhoneContact({
                  clientId: BigInt(Date.now()),
                  phone: phoneDigits,
                  firstName: 'Contacto',
                  lastName: 'Telegram'
                })
              ]
            })
          );

          const user = imported?.users?.[0];
          if (!user) {
            recipientCache.set(key, null);
            return null;
          }

          const entity = await session.client.getInputEntity(user);
          recipientCache.set(key, entity);
          return entity;
        } catch {
          recipientCache.set(key, null);
          return null;
        }
      }
    };

    dispatchers.push({
      id: row.id,
      type: 'telegram',
      name: row.name || `Canal ${row.id}`,
      phone: row.phone_number || '',
      areaCode: row.area_code || '549',
      async isOnWhatsApp(jid) {
        const entity = await resolveEntity(jid);
        return Boolean(entity);
      },
      async sendText(jid, text) {
        const entity = await resolveEntity(jid);
        if (!entity) {
          throw new Error('Sin Telegram');
        }
        await session.client.sendMessage(entity, { message: text });
      }
    });
  }

  return dispatchers;
}
