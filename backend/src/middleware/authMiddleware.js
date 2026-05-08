import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import logger from '../logger.js';
import { query } from '../db/index.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function extractHeaderToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const [, token] = authHeader.split(' ');
  return token;
}

function validateActiveSession(payload) {
  return query('SELECT active_session_id, role FROM users WHERE id = $1', [payload.userId])
    .then(({ rows }) => rows[0] || null)
    .catch((error) => {
      logger.error('Error verificando la sesión activa:', error);
      throw error;
    });
}

export function authenticate(req, res, next) {
  const token = extractHeaderToken(req);
  if (!token) {
    return res.status(401).json({ message: 'No autorizado.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });

    validateActiveSession(payload)
      .then((sessionRow) => {
        if (!sessionRow) {
          return res.status(401).json({ message: 'No autorizado.' });
        }

        if (!payload.sessionId || sessionRow.active_session_id !== payload.sessionId) {
          logger.warn(
            'Sesión inválida detectada para el usuario %s: token %s no coincide con la sesión activa',
            payload.username || payload.userId,
            payload.sessionId
          );
          return res
            .status(401)
            .json({ message: 'La sesión ha sido cerrada desde otro dispositivo.' });
        }

        req.user = { ...payload, role: sessionRow.role || payload.role };
        return next();
      })
      .catch((error) => {
        if (!res.headersSent) {
          logger.error('Fallo al autenticar la sesión activa:', error.message);
          return res.status(500).json({ message: 'Error interno del servidor.' });
        }
        return undefined;
      });
  } catch (error) {
    logger.error('JWT verification failed:', error.message);
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
}

export function requireAdmin(_req, res, next) {
  const { user } = _req;
  if (user && user.role === 'admin') {
    return next();
  }

  return res.status(403).json({ message: 'Requiere permisos de administrador.' });
}

export function authenticateAllowQuery(req, res, next) {
  const token = extractHeaderToken(req) || (req.query?.token ? String(req.query.token) : null);
  if (!token) {
    return res.status(401).json({ message: 'No autorizado.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });

    validateActiveSession(payload)
      .then((sessionRow) => {
        if (!sessionRow) {
          return res.status(401).json({ message: 'No autorizado.' });
        }

        if (!payload.sessionId || sessionRow.active_session_id !== payload.sessionId) {
          logger.warn(
            'Sesión inválida detectada para el usuario %s (query): token %s no coincide con la sesión activa',
            payload.username || payload.userId,
            payload.sessionId
          );
          return res
            .status(401)
            .json({ message: 'La sesión ha sido cerrada desde otro dispositivo.' });
        }

        req.user = { ...payload, role: sessionRow.role || payload.role };
        return next();
      })
      .catch((error) => {
        if (!res.headersSent) {
          logger.error('Fallo al autenticar la sesión activa (query):', error.message);
          return res.status(500).json({ message: 'Error interno del servidor.' });
        }
        return undefined;
      });
  } catch (error) {
    logger.error('JWT verification failed:', error.message);
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
}
