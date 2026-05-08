import { Router } from 'express';
import multer from 'multer';
import { uploadData, listUploads } from '../controllers/dataController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = (file.originalname?.split('.').pop() || '').toLowerCase();
    if (['xls', 'xlsx'].includes(extension)) {
      callback(null, true);
    } else {
      callback(new Error('Solo se permiten archivos Excel (.xls, .xlsx).'));
    }
  }
});

router.use(authenticate);

router.get('/uploads', listUploads);

router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      const message =
        error.message === 'File too large'
          ? 'El archivo es demasiado grande (máximo 5 MB).'
          : error.message;
      return res.status(400).json({ message: message || 'No se pudo procesar el archivo seleccionado.' });
    }

    return uploadData(req, res);
  });
});

export default router;
