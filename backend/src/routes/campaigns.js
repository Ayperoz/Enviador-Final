import { Router } from 'express';
import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  updateCampaignEnabled
} from '../controllers/campaignController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', listCampaigns);
router.post('/', createCampaign);
router.put('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);
router.patch('/:id/enabled', updateCampaignEnabled);

export default router;
