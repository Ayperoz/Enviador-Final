import { query } from '../db/index.js';
import { getNonNegativeIntFromEnv } from './limits.js';

export async function syncChannelWarmers() {
  const warmersLimit = getNonNegativeIntFromEnv('CANT_CALENTADORES');

  if (warmersLimit == null) {
    await query(
      `UPDATE channels
       SET calentador = TRUE
       WHERE calentador IS DISTINCT FROM TRUE`
    );
    return;
  }

  await query(
    `WITH ordered AS (
       SELECT id,
              ROW_NUMBER() OVER (ORDER BY id ASC) AS position
       FROM channels
     )
     UPDATE channels
     SET calentador = ordered.position <= $1
     FROM ordered
     WHERE channels.id = ordered.id;`,
    [warmersLimit]
  );
}
