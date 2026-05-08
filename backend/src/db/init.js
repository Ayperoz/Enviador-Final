import { query } from './index.js';
import { hashPassword } from '../utils/password.js';
import { syncChannelWarmers } from '../utils/channelWarmers.js';

const DEFAULT_ADMIN_USER = {
  username: 'lgiardino@alt64.com',
  password: 'Simple2020!',
  theme: 'light',
  name: 'Administrador',
  notifyCampaignStarted: false,
  notifyCampaignFinished: false,
  notifyChannelStarted: false,
  notifyChannelDisconnected: false,
  role: 'admin'
};

const DEFAULT_CLIENT_USER = {
  username: 'admin',
  password: 'Simple2020',
  theme: 'light',
  name: 'Cliente',
  notifyCampaignStarted: false,
  notifyCampaignFinished: false,
  notifyChannelStarted: false,
  notifyChannelDisconnected: false,
  role: 'user'
};

async function ensureSeedUser(user) {
  const passwordHash = hashPassword(user.password);

  await query(
    `INSERT INTO users (
       username,
       password_hash,
       theme,
       name,
       notify_campaign_started,
       notify_campaign_finished,
       notify_channel_started,
       notify_channel_disconnected,
       role
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (username)
     DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       theme = COALESCE(users.theme, EXCLUDED.theme),
       name = COALESCE(users.name, EXCLUDED.name),
       notify_campaign_started = COALESCE(users.notify_campaign_started, EXCLUDED.notify_campaign_started),
       notify_campaign_finished = COALESCE(users.notify_campaign_finished, EXCLUDED.notify_campaign_finished),
       notify_channel_started = COALESCE(users.notify_channel_started, EXCLUDED.notify_channel_started),
       notify_channel_disconnected = COALESCE(users.notify_channel_disconnected, EXCLUDED.notify_channel_disconnected),
       role = EXCLUDED.role,
       updated_at = NOW();`,
    [
      user.username,
      passwordHash,
      user.theme,
      user.name,
      user.notifyCampaignStarted,
      user.notifyCampaignFinished,
      user.notifyChannelStarted,
      user.notifyChannelDisconnected,
      user.role
    ]
  );
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      theme VARCHAR(20) DEFAULT 'light',
      name VARCHAR(255),
      notify_campaign_started BOOLEAN DEFAULT FALSE,
      notify_campaign_finished BOOLEAN DEFAULT FALSE,
      notify_channel_started BOOLEAN DEFAULT FALSE,
      notify_channel_disconnected BOOLEAN DEFAULT FALSE,
      client_phone VARCHAR(50),
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      active_session_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light';
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS name VARCHAR(255);
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notify_campaign_started BOOLEAN DEFAULT FALSE;
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notify_campaign_finished BOOLEAN DEFAULT FALSE;
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notify_channel_started BOOLEAN DEFAULT FALSE;
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notify_channel_disconnected BOOLEAN DEFAULT FALSE;
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS client_phone VARCHAR(50);
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS active_session_id UUID;
  `);

  await query(`
    UPDATE users
    SET role = COALESCE(NULLIF(role, ''), 'user');
  `);

  await query(`
    UPDATE users
    SET theme = COALESCE(theme, 'light');
  `);

  await query(`
    UPDATE users
    SET name = COALESCE(name, username);
  `);

  await query(`
    UPDATE users
    SET updated_at = COALESCE(updated_at, NOW());
  `);

  await query(`
    UPDATE users
    SET notify_campaign_started = COALESCE(notify_campaign_started, FALSE);
  `);

  await query(`
    UPDATE users
    SET notify_campaign_finished = COALESCE(notify_campaign_finished, FALSE);
  `);

  await query(`
    UPDATE users
    SET notify_channel_started = COALESCE(notify_channel_started, FALSE);
  `);

  await query(`
    UPDATE users
    SET notify_channel_disconnected = COALESCE(notify_channel_disconnected, FALSE);
  `);

  await ensureSeedUser(DEFAULT_ADMIN_USER);
  await ensureSeedUser(DEFAULT_CLIENT_USER);

  await query(`
    CREATE TABLE IF NOT EXISTS channels (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      channel_type VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
      phone_number VARCHAR(50),
      area_code VARCHAR(10) DEFAULT '549',
      telegram_api_id VARCHAR(50),
      telegram_api_hash VARCHAR(255),
      status VARCHAR(50) DEFAULT 'disconnected',
      session_state VARCHAR(50) DEFAULT 'initializing',
      warmup_enabled BOOLEAN DEFAULT FALSE,
      session_data JSONB,
      qr_code TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS channel_type VARCHAR(20) DEFAULT 'whatsapp';
  `);

  await query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS telegram_api_id VARCHAR(50);
  `);

  await query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS telegram_api_hash VARCHAR(255);
  `);

  await query(`
    UPDATE channels
    SET channel_type = COALESCE(NULLIF(channel_type, ''), 'whatsapp');
  `);

  await query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS warmup_enabled BOOLEAN DEFAULT FALSE;
  `);

  await query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS area_code VARCHAR(10) DEFAULT '549';
  `);

  await query(`
    UPDATE channels
    SET area_code = COALESCE(NULLIF(regexp_replace(area_code::TEXT, '[^0-9]', '', 'g'), ''), '549');
  `);

  await query(`
    UPDATE channels
    SET warmup_enabled = FALSE
    WHERE warmup_enabled IS NULL;
  `);

  await query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS session_data JSONB;
  `);

  await query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS qr_code TEXT;
  `);

  await query(`
    ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS calentador BOOLEAN DEFAULT FALSE;
  `);

  await query(`
    UPDATE channels
    SET calentador = COALESCE(calentador, FALSE);
  `);

  await query(`
    ALTER TABLE channels
    ALTER COLUMN session_state SET DEFAULT 'initializing';
  `);

  await query(`
    UPDATE channels
    SET session_state = 'initializing'
    WHERE session_state IS NULL OR session_state IN ('awaiting_qr', 'pending');
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS campains (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
      channel_ids INTEGER[],
      min_delay INTEGER NOT NULL,
      max_delay INTEGER NOT NULL,
      base INTEGER NOT NULL CHECK (base BETWEEN 1 AND 9),
      schedule JSONB NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (min_delay > 0),
      CHECK (max_delay > 0),
      CHECK (min_delay <= max_delay)
    );
  `);

  await query(`
    ALTER TABLE campains
    ADD COLUMN IF NOT EXISTS channel_ids INTEGER[];
  `);

  await query(`
    UPDATE campains
    SET channel_ids = ARRAY[channel_id]
    WHERE channel_ids IS NULL AND channel_id IS NOT NULL;
  `);

  await query(`
    UPDATE campains
    SET channel_ids = ARRAY[]::INTEGER[]
    WHERE channel_ids IS NULL;
  `);

  await query(`
    ALTER TABLE campains
    ALTER COLUMN channel_ids SET DEFAULT ARRAY[]::INTEGER[];
  `);

  await query(`
    ALTER TABLE campains
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;
  `);

  await query(`
    ALTER TABLE campains
    ADD COLUMN IF NOT EXISTS schedule JSONB;
  `);

  await query(`
    ALTER TABLE campains
    ADD COLUMN IF NOT EXISTS min_delay INTEGER;
  `);

  await query(`
    ALTER TABLE campains
    ADD COLUMN IF NOT EXISTS max_delay INTEGER;
  `);

  await query(`
    ALTER TABLE campains
    ADD COLUMN IF NOT EXISTS base INTEGER;
  `);

  await query(`
    ALTER TABLE campains
    ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL;
  `);

  await query(`
    ALTER TABLE campains
    ALTER COLUMN base SET NOT NULL;
  `);

  await query(`
    ALTER TABLE campains
    ALTER COLUMN min_delay SET NOT NULL;
  `);

  await query(`
    ALTER TABLE campains
    ALTER COLUMN max_delay SET NOT NULL;
  `);

  await query(`
    ALTER TABLE campains
    ALTER COLUMN schedule SET NOT NULL;
  `);

  await syncChannelWarmers();

  await query(`
    CREATE TABLE IF NOT EXISTS public.entrantes (
  id SERIAL PRIMARY KEY,
  de VARCHAR(50),
  para VARCHAR(50),
  canal VARCHAR(30),
  mensaje TEXT,
  fecha DATE,
  hora TIME,
  message_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT ux_entrantes_canal_msg UNIQUE (canal, message_id)
);
  `);

  for (let index = 1; index <= 9; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await query(
      `CREATE TABLE IF NOT EXISTS envios${index} (
        id SERIAL PRIMARY KEY,
        desde VARCHAR(50),
        para VARCHAR(50),
        mensaje TEXT,
        canal VARCHAR(20),
        campania VARCHAR(100),
        fecha DATE,
        hora TIME,
        estado VARCHAR(20),
        validacion VARCHAR(50),
        fecha_subida DATE,
        hora_subida TIME,
        base VARCHAR(8),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`
    );
  }

  await query(`
    CREATE TABLE IF NOT EXISTS historico (
      id SERIAL PRIMARY KEY,
      desde VARCHAR(50),
      para VARCHAR(50),
      mensaje TEXT,
      canal VARCHAR(20),
      campania VARCHAR(100),
      fecha DATE,
      hora TIME,
      estado VARCHAR(20),
      validacion VARCHAR(50),
      fecha_subida DATE,
      hora_subida TIME,
      base VARCHAR(8),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      base INTEGER NOT NULL CHECK (base BETWEEN 1 AND 9),
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      registros INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ejecuciones (
      idrun SERIAL PRIMARY KEY,
      usuario VARCHAR(255) NOT NULL,
      reporte VARCHAR(150) NOT NULL,
      estado VARCHAR(50) NOT NULL DEFAULT 'iniciado',
      create_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
