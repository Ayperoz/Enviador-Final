import { Router } from 'express';
import {
  getAllLogs,
  getCampaignLogs,
  listCampaigns,
  subscribeToCampaigns,
  subscribeToLogs
} from '../services/monitorService.js';
import { authenticate, authenticateAllowQuery } from '../middleware/authMiddleware.js';
import { query } from '../db/index.js';
import logger from '../logger.js';

const router = Router();

function mergeCampaignLists(dbCampaigns, storedCampaigns) {
  const map = new Map();

  for (const campaign of storedCampaigns) {
    map.set(Number(campaign.id), campaign.name);
  }

  for (const row of dbCampaigns) {
    const id = Number(row.id);
    if (Number.isInteger(id)) {
      map.set(id, row.name || map.get(id) || `Campaña ${id}`);
    }
  }

  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

router.use((req, res, next) => {
  if (req.path === '/stream') {
    authenticateAllowQuery(req, res, next);
    return;
  }
  authenticate(req, res, next);
});

router.get('/campaigns', async (_req, res) => {
  try {
    const { rows } = await query('SELECT id, name FROM campains ORDER BY name ASC');
    const campaigns = mergeCampaignLists(rows, listCampaigns());
    res.json({ campaigns });
  } catch (error) {
    logger.error('Monitor: no se pudieron obtener las campañas.', error);
    res.status(500).json({ message: 'No se pudieron obtener las campañas.' });
  }
});

router.get('/logs', (req, res) => {
  const { campaignId } = req.query;
  if (campaignId) {
    res.json({ logs: getCampaignLogs(campaignId) });
    return;
  }

  res.json({ logs: getAllLogs() });
});

router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  res.flushHeaders?.();
  res.write(': connected\n\n');

  const campaignId = req.query?.campaignId;

  const sendEvent = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let dbCampaigns = [];
  try {
    const { rows } = await query('SELECT id, name FROM campains ORDER BY name ASC');
    dbCampaigns = rows;
  } catch (error) {
    logger.error('Monitor: no se pudieron cargar las campañas para el stream.', error);
  }

  const initialCampaigns = mergeCampaignLists(dbCampaigns, listCampaigns());
  const initialLogs = campaignId ? getCampaignLogs(campaignId) : getAllLogs();
  sendEvent('snapshot', { campaigns: initialCampaigns, logs: initialLogs });

  const logUnsubscribe = subscribeToLogs((entry) => {
    if (!campaignId || Number(entry.campaignId) === Number(campaignId)) {
      sendEvent('log', entry);
    }
  });

  const campaignUnsubscribe = subscribeToCampaigns((campaigns) => {
    sendEvent('campaigns', campaigns);
  });

  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    logUnsubscribe();
    campaignUnsubscribe();
    res.end();
  });
});

export default router;
