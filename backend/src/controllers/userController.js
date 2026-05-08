import { query } from '../db/index.js';
import { hashPassword } from '../utils/password.js';
import logger from '../logger.js';
import { setEnvValue } from '../utils/envConfig.js';

const ALLOWED_THEMES = new Set(['light', 'dark']);
const ALLOWED_ROLES = new Set(['admin', 'user']);

const BOOLEAN_FIELD_MAPPINGS = [
  { key: 'notifyCampaignStarted', column: 'notify_campaign_started' },
  { key: 'notifyCampaignFinished', column: 'notify_campaign_finished' },
  { key: 'notifyChannelStarted', column: 'notify_channel_started' },
  { key: 'notifyChannelDisconnected', column: 'notify_channel_disconnected' }
];

/**
 * Mapea una fila SQL al contrato de usuario utilizado por la API.
 */
function mapUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    theme: row.theme || 'light',
    name: row.name || row.username,
    role: row.role || 'user',
    notifyCampaignStarted: Boolean(row.notifyCampaignStarted ?? row.notify_campaign_started),
    notifyCampaignFinished: Boolean(row.notifyCampaignFinished ?? row.notify_campaign_finished),
    notifyChannelStarted: Boolean(row.notifyChannelStarted ?? row.notify_channel_started),
    notifyChannelDisconnected: Boolean(
      row.notifyChannelDisconnected ?? row.notify_channel_disconnected
    )
  };
}

/**
 * Devuelve el perfil del usuario autenticado junto al teléfono cliente configurado.
 */
export async function getCurrentUser(req, res) {
  try {
    const { rows } = await query(
      `SELECT
         id,
         username,
         theme,
         name,
         role,
         notify_campaign_started AS "notifyCampaignStarted",
         notify_campaign_finished AS "notifyCampaignFinished",
         notify_channel_started AS "notifyChannelStarted",
         notify_channel_disconnected AS "notifyChannelDisconnected"
       FROM users
       WHERE id = $1`,
      [req.user.userId]
    );
    const user = mapUserRow(rows[0]);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const clientPhone = process.env.CLIENTE_PHONE || '';
    return res.json({ ...user, clientPhone });
  } catch (error) {
    logger.error('Error obteniendo el perfil de usuario:', error);
    return res.status(500).json({ message: 'No se pudo obtener el perfil.' });
  }
}

/**
 * Permite al usuario autenticado actualizar sus preferencias, credenciales y flags personales.
 */
export async function updateCurrentUser(req, res) {
  const {
    username,
    password,
    theme,
    name,
    clientPhone,
    notifyCampaignStarted,
    notifyCampaignFinished,
    notifyChannelStarted,
    notifyChannelDisconnected
  } = req.body;

  const updates = [];
  const values = [];
  let index = 1;

  if (typeof username === 'string' && username.trim()) {
    updates.push(`username = $${index}`);
    values.push(username.trim());
    index += 1;
  }

  if (typeof name === 'string') {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ message: 'El nombre es obligatorio.' });
    }
    updates.push(`name = $${index}`);
    values.push(trimmedName);
    index += 1;
  }

  if (typeof theme === 'string') {
    const normalizedTheme = theme.toLowerCase();
    if (!ALLOWED_THEMES.has(normalizedTheme)) {
      return res.status(400).json({ message: 'Tema inválido.' });
    }
    updates.push(`theme = $${index}`);
    values.push(normalizedTheme);
    index += 1;
  }

  if (typeof password === 'string' && password) {
    updates.push(`password_hash = $${index}`);
    values.push(hashPassword(password));
    index += 1;
  }

  if (req.body.role) {
    logger.warn('Intento de actualización de rol ignorado para el usuario actual.');
  }

  const booleanPayload = {
    notifyCampaignStarted,
    notifyCampaignFinished,
    notifyChannelStarted,
    notifyChannelDisconnected
  };

  for (const { key, column } of BOOLEAN_FIELD_MAPPINGS) {
    if (typeof booleanPayload[key] === 'boolean') {
      updates.push(`${column} = $${index}`);
      values.push(booleanPayload[key]);
      index += 1;
    }
  }

  const currentClientPhone = process.env.CLIENTE_PHONE || '';
  let nextClientPhone;
  const hasClientPhone = typeof clientPhone === 'string';

  if (hasClientPhone) {
    nextClientPhone = clientPhone.trim();
  }

  const requiresDbUpdate = updates.length > 0;
  const requiresEnvUpdate = hasClientPhone && nextClientPhone !== currentClientPhone;

  if (!requiresDbUpdate && !requiresEnvUpdate) {
    return res.status(400).json({ message: 'No hay cambios para guardar.' });
  }

  if (requiresDbUpdate) {
    updates.push(`updated_at = NOW()`);
  }

  try {
    let user;

    if (requiresDbUpdate) {
      values.push(req.user.userId);
      const { rows } = await query(
        `UPDATE users
         SET ${updates.join(', ')}
         WHERE id = $${index}
         RETURNING
           id,
           username,
          theme,
          name,
          role,
          notify_campaign_started AS "notifyCampaignStarted",
          notify_campaign_finished AS "notifyCampaignFinished",
          notify_channel_started AS "notifyChannelStarted",
          notify_channel_disconnected AS "notifyChannelDisconnected"`,
        values
      );

      user = mapUserRow(rows[0]);

      if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado.' });
      }
    } else {
      const { rows } = await query(
        `SELECT
           id,
           username,
           theme,
           name,
           role,
           notify_campaign_started AS "notifyCampaignStarted",
           notify_campaign_finished AS "notifyCampaignFinished",
           notify_channel_started AS "notifyChannelStarted",
           notify_channel_disconnected AS "notifyChannelDisconnected"
         FROM users
         WHERE id = $1`,
        [req.user.userId]
      );
      user = mapUserRow(rows[0]);

      if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado.' });
      }
    }

    if (requiresEnvUpdate) {
      await setEnvValue('CLIENTE_PHONE', nextClientPhone || '');
    }

    const clientPhoneValue = process.env.CLIENTE_PHONE || '';
    return res.json({ ...user, clientPhone: clientPhoneValue });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'El usuario ya existe. Elige otro nombre.' });
    }
    logger.error('Error actualizando el perfil de usuario:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el perfil.' });
  }
}

/**
 * Lista todos los usuarios para la pantalla administrativa de configuración.
 */
export async function listUsers(_req, res) {
  try {
    const { rows } = await query(
      `SELECT
         id,
         username,
         theme,
         name,
         role,
         notify_campaign_started AS "notifyCampaignStarted",
         notify_campaign_finished AS "notifyCampaignFinished",
         notify_channel_started AS "notifyChannelStarted",
         notify_channel_disconnected AS "notifyChannelDisconnected"
       FROM users
       ORDER BY created_at DESC, id DESC`
    );

    return res.json(rows.map(mapUserRow));
  } catch (error) {
    logger.error('Error obteniendo la lista de usuarios:', error);
    return res.status(500).json({ message: 'No se pudieron obtener los usuarios.' });
  }
}

/**
 * Normaliza y valida el rol de usuario permitido por la plataforma.
 */
function normalizeRole(role) {
  if (typeof role !== 'string') {
    return null;
  }

  const normalized = role.trim().toLowerCase();
  if (!ALLOWED_ROLES.has(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Normaliza y valida el tema visual permitido.
 */
function normalizeTheme(theme) {
  if (typeof theme !== 'string') {
    return null;
  }

  const normalized = theme.trim().toLowerCase();
  if (!ALLOWED_THEMES.has(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Crea un nuevo usuario desde el panel administrativo.
 */
export async function createUser(req, res) {
  const { username, password, role = 'user', theme = 'light', name } = req.body;

  if (typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ message: 'El usuario es obligatorio.' });
  }

  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'La contraseña es obligatoria.' });
  }

  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return res.status(400).json({ message: 'Rol inválido.' });
  }

  const normalizedTheme = normalizeTheme(theme);
  if (!normalizedTheme) {
    return res.status(400).json({ message: 'Tema inválido.' });
  }

  const trimmedUsername = username.trim();
  const trimmedName = typeof name === 'string' && name.trim() ? name.trim() : trimmedUsername;

  try {
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, theme, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id,
         username,
         theme,
         name,
         role,
         notify_campaign_started AS "notifyCampaignStarted",
         notify_campaign_finished AS "notifyCampaignFinished",
         notify_channel_started AS "notifyChannelStarted",
         notify_channel_disconnected AS "notifyChannelDisconnected"`,
      [trimmedUsername, hashPassword(password), normalizedTheme, trimmedName, normalizedRole]
    );

    const user = mapUserRow(rows[0]);
    return res.status(201).json(user);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'El usuario ya existe. Elige otro nombre.' });
    }
    logger.error('Error creando usuario:', error);
    return res.status(500).json({ message: 'No se pudo crear el usuario.' });
  }
}

/**
 * Actualiza un usuario existente desde el panel administrativo.
 */
export async function updateUser(req, res) {
  const userId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  const {
    username,
    password,
    theme,
    name,
    role,
    notifyCampaignStarted,
    notifyCampaignFinished,
    notifyChannelStarted,
    notifyChannelDisconnected
  } = req.body;

  const updates = [];
  const values = [];
  let index = 1;

  if (typeof username === 'string' && username.trim()) {
    updates.push(`username = $${index}`);
    values.push(username.trim());
    index += 1;
  }

  if (typeof name === 'string') {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ message: 'El nombre es obligatorio.' });
    }
    updates.push(`name = $${index}`);
    values.push(trimmedName);
    index += 1;
  }

  if (typeof theme === 'string') {
    const normalizedTheme = normalizeTheme(theme);
    if (!normalizedTheme) {
      return res.status(400).json({ message: 'Tema inválido.' });
    }
    updates.push(`theme = $${index}`);
    values.push(normalizedTheme);
    index += 1;
  }

  if (typeof role === 'string') {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
      return res.status(400).json({ message: 'Rol inválido.' });
    }
    updates.push(`role = $${index}`);
    values.push(normalizedRole);
    index += 1;
  }

  if (typeof password === 'string' && password) {
    updates.push(`password_hash = $${index}`);
    values.push(hashPassword(password));
    index += 1;
  }

  const booleanPayload = {
    notifyCampaignStarted,
    notifyCampaignFinished,
    notifyChannelStarted,
    notifyChannelDisconnected
  };

  for (const { key, column } of BOOLEAN_FIELD_MAPPINGS) {
    if (typeof booleanPayload[key] === 'boolean') {
      updates.push(`${column} = $${index}`);
      values.push(booleanPayload[key]);
      index += 1;
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No hay cambios para guardar.' });
  }

  updates.push(`updated_at = NOW()`);

  try {
    values.push(userId);
    const { rows } = await query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${index}
       RETURNING
         id,
         username,
         theme,
         name,
         role,
         notify_campaign_started AS "notifyCampaignStarted",
         notify_campaign_finished AS "notifyCampaignFinished",
         notify_channel_started AS "notifyChannelStarted",
         notify_channel_disconnected AS "notifyChannelDisconnected"`,
      values
    );

    const user = mapUserRow(rows[0]);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    return res.json(user);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'El usuario ya existe. Elige otro nombre.' });
    }
    logger.error('Error actualizando usuario:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el usuario.' });
  }
}

/**
 * Elimina un usuario, excepto el propio usuario autenticado.
 */
export async function deleteUser(req, res) {
  const userId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  if (userId === req.user.userId) {
    return res
      .status(400)
      .json({ message: 'No puedes eliminar tu propio usuario mientras estás conectado.' });
  }

  try {
    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [userId]);

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    return res.status(204).send();
  } catch (error) {
    logger.error('Error eliminando usuario:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el usuario.' });
  }
}
