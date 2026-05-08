import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  downloadReport,
  listAvailableReports,
  listExecutions,
  runReport
} from '../controllers/reportController.js';

const router = Router();

router.use(authenticate);

router.get('/', listAvailableReports);
router.get('/executions', listExecutions);
router.post('/run', runReport);
router.get('/download/:idrun', downloadReport);

export default router;
