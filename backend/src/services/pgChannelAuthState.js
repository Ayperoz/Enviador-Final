import pg from "pg";
import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// serializa/deserializa Buffers dentro de JSON
const encode = (val) => JSON.parse(JSON.stringify(val, BufferJSON.replacer));
const decode = (val) => JSON.parse(JSON.stringify(val ?? {}), BufferJSON.reviver);

async function loadChannelSession(channelId) {
  const { rows } = await pool.query(
    `SELECT session_data FROM public.channels WHERE id = $1`,
    [channelId]
  );
  if (!rows[0]) throw new Error(`Channel ${channelId} no existe`);
  const sd = rows[0].session_data ?? {};
  return {
    creds: decode(sd.creds) || initAuthCreds(),
    keys:  decode(sd.keys)  || {},
  };
}

async function saveChannelSession(channelId, sessionObj) {
  const toSave = {
    creds: encode(sessionObj.creds),
    keys:  encode(sessionObj.keys),
  };
  await pool.query(
    `UPDATE public.channels SET session_data = $2, updated_at = now() WHERE id = $1`,
    [channelId, toSave]
  );
}

export async function useChannelAuthState(channelId) {
  let { creds, keys } = await loadChannelSession(channelId);

  async function get(type, ids) {
    const out = {};
    if (!ids?.length) return out;
    const bucket = keys?.[type] || {};
    for (const id of ids) if (bucket[id] !== undefined) out[id] = bucket[id];
    return decode(out);
  }

  async function set(data) {
    keys = keys || {};
    for (const category of Object.keys(data || {})) {
      keys[category] = keys[category] || {};
      const entries = data[category] || {};
      for (const id of Object.keys(entries)) {
        keys[category][id] = encode(entries[id]);
      }
    }
    await saveChannelSession(channelId, { creds, keys });
  }

  async function saveCreds() {
    await saveChannelSession(channelId, { creds, keys });
  }

  return { state: { creds, keys: { get, set } }, saveCreds };
}
