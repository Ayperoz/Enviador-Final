import app from './server.js';
import { initDb } from './db/init.js';
import { bootstrapWhatsAppSessions } from './services/whatsappService.js';
import { initializeCampaignEngine } from './services/campaignEngine.js';
import logger from './logger.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.BIND_ADDRESS || '0.0.0.0';

async function start() {
  try {
    await initDb();
    await bootstrapWhatsAppSessions();
    await initializeCampaignEngine();

    app.listen(PORT, HOST, () => {
      logger.info(`API listening on ${HOST}:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();