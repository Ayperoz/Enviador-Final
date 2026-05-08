import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { query } from '../db/index.js';
import { verifyPassword } from '../utils/password.js';
import logger from '../logger.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const TOKEN_EXPIRATION = process.env.JWT_EXPIRATION || null;

/**
 * Autentica al usuario, registra la sesión activa y devuelve el JWT
 * con metadatos de perfil para que el frontend ajuste permisos y preferencias.
 */
export async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña son obligatorios.' });
  }

  try {
    const { rows } = await query(
      `SELECT
         id,
         username,
         password_hash,
         theme,
         name,
         role,
         notify_campaign_started AS "notifyCampaignStarted",
         notify_campaign_finished AS "notifyCampaignFinished",
         notify_channel_started AS "notifyChannelStarted",
         notify_channel_disconnected AS "notifyChannelDisconnected"
       FROM users
       WHERE username = $1`,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const user = rows[0];
    const isMatch = verifyPassword(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const sessionId = randomUUID();

    await query('UPDATE users SET active_session_id = $1, updated_at = NOW() WHERE id = $2', [
      sessionId,
      user.id
    ]);

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionId
    };
    const token = TOKEN_EXPIRATION
      ? jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRATION })
      : jwt.sign(payload, JWT_SECRET);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        theme: user.theme || 'light',
        name: user.name || user.username,
        role: user.role || 'user',
        clientPhone: process.env.CLIENTE_PHONE || '',
        notifyCampaignStarted: Boolean(user.notifyCampaignStarted),
        notifyCampaignFinished: Boolean(user.notifyCampaignFinished),
        notifyChannelStarted: Boolean(user.notifyChannelStarted),
        notifyChannelDisconnected: Boolean(user.notifyChannelDisconnected)
      }
    });
  } catch (error) {
    logger.error('Error al iniciar sesión:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
}
