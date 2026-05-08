import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/authMiddleware.js';
import { getSettings, updateSettings } from '../controllers/settingsController.js';

const router = Router();

router.use(authenticate);

router.get('/', getSettings);
router.put('/', requireAdmin, updateSettings);
router.patch('/', requireAdmin, updateSettings);

export default router;
