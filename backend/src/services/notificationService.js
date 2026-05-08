import { query } from '../db/index.js';
import logger from '../logger.js';

const NOTIFIER_URL =
  process.env.NOTIFIER_URL ||
  'https://evolution.soluciones-alt64.com/message/sendText/Notificador';
const NOTIFIER_APIKEY = process.env.NOTIFIER_APIKEY || 'GkPqMfH2VpJf632322BmPq7#BJCG';

const EVENT_COLUMN = {
  campaignStarted: 'notify_campaign_started',
  campaignFinished: 'notify_campaign_finished',
  channelStarted: 'notify_channel_started',
  channelDisconnected: 'notify_channel_disconnected'
};

function getNotificationPhone() {
  const raw = String(process.env.CLIENTE_PHONE || '').replace(/[^0-9]/g, '');
  return raw || null;
}

async function hasSubscribers(column) {
  const { rows } = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM users
     WHERE ${column} = TRUE`
  );

  return Number(rows[0]?.total || 0) > 0;
}

export async function notifyByEvent(eventKey, message) {
  const column = EVENT_COLUMN[eventKey];
  if (!column || !message) {
    return;
  }

  const phone = getNotificationPhone();
  if (!phone) {
    return;
  }

  const shouldNotify = await hasSubscribers(column);
  if (!shouldNotify) {
    return;
  }

  try {
    const response = await fetch(NOTIFIER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: NOTIFIER_APIKEY },
      body: JSON.stringify({ number: phone, text: message })
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      logger.warn(
        `No se pudo enviar notificación (${eventKey}): ${response.status} ${response.statusText} ${responseText}`
      );
    }
  } catch (error) {
    logger.warn(`Error enviando notificación (${eventKey}):`, error);
  }
}
