import XLSX from 'xlsx';
import { getClient, query } from '../db/index.js';
import logger from '../logger.js';

const ENVIOS_TABLES = Array.from({ length: 9 }, (_value, index) => `envios${index + 1}`);
const ENVIOS_TABLE_DEFINITION = `(
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
)`;

function getEnviosTableName(baseNumber) {
  return ENVIOS_TABLES[baseNumber - 1];
}

function buildCreateEnviosTableSql(tableName) {
  return `CREATE TABLE IF NOT EXISTS ${tableName} ${ENVIOS_TABLE_DEFINITION};`;
}

async function archiveAndResetBaseTable(client, tableName) {
  const { rows } = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  const tableExists = rows[0]?.table_name;

  if (tableExists) {
    await client.query(
      `INSERT INTO historico (desde, para, mensaje, canal, campania, fecha, hora, estado, validacion, fecha_subida, hora_subida, base, created_at)
       SELECT desde, para, mensaje, canal, campania, fecha, hora, estado, validacion, fecha_subida, hora_subida, base, created_at
       FROM ${tableName}
       WHERE estado IS NOT NULL`
    );
  }

  await client.query(`DROP TABLE IF EXISTS ${tableName};`);
  await client.query(buildCreateEnviosTableSql(tableName));
}
const MAX_FILE_SIZE_MB = 5;

function normalizeHeaderCell(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeCell(value) {
  if (value == null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

function ensureValidBase(base) {
  const numeric = Number(base);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > ENVIOS_TABLES.length) {
    throw new Error('La base seleccionada es inválida.');
  }
  return numeric;
}

function parseExcelBuffer(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (error) {
    throw new Error('El archivo seleccionado no es un Excel válido.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo está vacío.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  if (!rows || rows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = (headerRow ?? []).map(normalizeHeaderCell);

  if (normalizedHeaders[0] !== 'telefono' || normalizedHeaders[1] !== 'mensaje') {
    throw new Error('El archivo debe contener las columnas "telefono" y "mensaje" en la primera fila.');
  }

  const entries = [];
  dataRows.forEach((row) => {
    if (!Array.isArray(row)) {
      return;
    }

    const telefono = normalizeCell(row[0]);
    const mensaje = normalizeCell(row[1]);

    if (!telefono) {
      return;
    }

    entries.push({ para: telefono, mensaje });
  });

  return entries;
}

async function insertRowsIntoBase(client, baseNumber, records) {
  if (records.length === 0) {
    return 0;
  }

  const tableName = getEnviosTableName(baseNumber);
  const chunkSize = 500;
  let inserted = 0;

  for (let index = 0; index < records.length; index += chunkSize) {
    const chunk = records.slice(index, index + chunkSize);
    const phones = chunk.map((row) => row.para);
    const messages = chunk.map((row) => row.mensaje);

    await client.query(
      `INSERT INTO ${tableName} (para, mensaje, fecha_subida, hora_subida, base)
       SELECT data.para, data.mensaje, CURRENT_DATE, CURRENT_TIME, $3
       FROM UNNEST($1::TEXT[], $2::TEXT[]) AS data(para, mensaje)`,
      [phones, messages, String(baseNumber)]
    );

    inserted += chunk.length;
  }

  return inserted;
}

function truncateStatus(message) {
  if (typeof message !== 'string') {
    return 'Error desconocido';
  }

  if (message.length <= 255) {
    return message;
  }

  return `${message.slice(0, 252)}...`;
}

export async function uploadData(req, res) {
  try {
    const baseNumber = ensureValidBase(req.body?.base);

    if (!req.file) {
      return res.status(400).json({ message: 'Selecciona un archivo Excel para continuar.' });
    }

    if (req.file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return res.status(400).json({ message: `El archivo supera el máximo de ${MAX_FILE_SIZE_MB} MB.` });
    }

    const extension = (req.file.originalname?.split('.').pop() || '').toLowerCase();
    if (!['xls', 'xlsx'].includes(extension)) {
      return res.status(400).json({ message: 'Solo se permiten archivos Excel (.xls, .xlsx).' });
    }

    const rows = parseExcelBuffer(req.file.buffer);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'El archivo no contiene registros válidos para cargar.' });
    }

    const client = await getClient();
    let inserted = 0;
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const tableName = getEnviosTableName(baseNumber);
      await archiveAndResetBaseTable(client, tableName);

      inserted = await insertRowsIntoBase(client, baseNumber, rows);

      await client.query(
        'INSERT INTO uploads (base, fecha, registros, estado) VALUES ($1, NOW(), $2, $3)',
        [baseNumber, inserted, 'Completado']
      );

      await client.query('COMMIT');

      return res.status(201).json({
        base: baseNumber,
        inserted,
        message: `Se cargaron ${inserted} registros en la base ${baseNumber}.`
      });
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK');
      }

      await query(
        'INSERT INTO uploads (base, fecha, registros, estado) VALUES ($1, NOW(), $2, $3)',
        [baseNumber, inserted, truncateStatus(`Error: ${error.message}`)]
      );

      logger.error('Failed to upload data:', error);
      return res.status(500).json({ message: 'No se pudo completar la carga de datos.' });
    } finally {
      client.release();
    }
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Solicitud inválida.' });
  }
}

export async function listUploads(_req, res) {
  try {
    const { rows } = await query(
      `SELECT id, base, fecha, registros, estado
       FROM uploads
       ORDER BY fecha DESC
       LIMIT 10`
    );

    const payload = rows.map((row) => ({
      id: row.id,
      base: Number(row.base),
      registros: Number(row.registros) || 0,
      estado: row.estado,
      fecha: row.fecha instanceof Date ? row.fecha.toISOString() : row.fecha
    }));

    return res.json(payload);
  } catch (error) {
    logger.error('Failed to list uploads:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las cargas recientes.' });
  }
}
