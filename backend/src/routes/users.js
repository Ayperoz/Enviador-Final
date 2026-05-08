import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/authMiddleware.js';
import {
  getCurrentUser,
  updateCurrentUser,
  listUsers,
  createUser,
  updateUser,
  deleteUser
} from '../controllers/userController.js';

const router = Router();

router.use(authenticate);

router.get('/me', getCurrentUser);
router.put('/me', updateCurrentUser);
router.patch('/me', updateCurrentUser);

router.use(requireAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
