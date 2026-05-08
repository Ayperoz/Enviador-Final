import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 20,                     // ← subimos el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

export const Incoming = {
  /**
   * dto: { de, para, canal, mensaje, message_id }
   * Graba en public.entrantes con fecha/hora actuales del servidor.
   * Idempotente por (canal, message_id).
   */
  async store(dto) {
    const q = `
      INSERT INTO public.entrantes
        (de, para, canal, mensaje, fecha, hora, created_at, message_id)
      VALUES
         (
          $1, $2, $3, $4,
          (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,                -- fecha local
          (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::time(0),            -- HH:MM:SS sin ms
          NOW(),                                                                     -- created_at (timestamptz)
          $5
        )
      ON CONFLICT (canal, message_id) DO NOTHING
      RETURNING id
    `;
    const v = [dto.de, dto.para, dto.canal, dto.mensaje, dto.message_id];

    try {
      const { rows } = await pool.query(q, v);
      return rows[0]?.id ?? null; // null si fue conflicto (duplicado)
    } catch (err) {
      console.error("Incoming.store error:", err);
      return null;
    }
  }
};
