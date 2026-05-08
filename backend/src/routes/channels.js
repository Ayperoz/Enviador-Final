import { Router } from 'express';
import {
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  disconnectChannel,
  regenerateQr,
  getQr,
  startWarmup
} from '../controllers/channelController.js';
import { authenticate, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', listChannels);
router.post('/', createChannel);
router.put('/:id', updateChannel);
router.delete('/:id', requireAdmin, deleteChannel);
router.post('/:id/session/disconnect', disconnectChannel);
router.post('/:id/session/regenerate', regenerateQr);
router.get('/:id/qr', getQr);
router.post('/:id/warmup/start', startWarmup);

export default router;
