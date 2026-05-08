import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

import { query } from '../db/index.js';
import logger from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.resolve(__dirname, '../../tmp/reports');

async function ensureReportsDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

async function updateExecutionStatus(idrun, status) {
  await query('UPDATE ejecuciones SET estado = $1 WHERE idrun = $2', [status, idrun]);
}

async function pruneOldExecutions() {
  const { rows } = await query(
    `SELECT idrun
     FROM ejecuciones
     ORDER BY create_at DESC
     OFFSET 10`
  );

  if (!rows.length) {
    return;
  }

  const staleIds = rows.map((row) => row.idrun);

  await Promise.all(
    staleIds.map(async (id) => {
      const filePath = path.join(REPORTS_DIR, `rpt${id}.xlsx`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error(`No se pudo eliminar el archivo del reporte ${id}:`, error);
        }
      }
    })
  );

  await query('DELETE FROM ejecuciones WHERE idrun = ANY($1::int[])', [staleIds]);
}

function mapRowsToWorksheetData(rows, columns) {
  return rows.map((row) => {
    const mapped = {};

    columns.forEach(({ field, header, formatter }) => {
      const rawValue = row[field];
      mapped[header] = formatter ? formatter(rawValue, row) : rawValue ?? '';
    });

    return mapped;
  });
}

function buildWorkbookBuffer(rows, columns) {
  const headers = columns.map((column) => column.header);
  const data = mapRowsToWorksheetData(rows, columns);
  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const ENVIOS_UNION_QUERY = Array.from({ length: 9 }, (_, index) => index + 1)
  .map((base) => `SELECT desde, estado FROM public.envios${base}`)
  .join('\n        UNION ALL\n        ');

const REPORT_DEFINITIONS = [
  {
    id: 1,
    key: 'entrantes',
    name: 'Reporte Entrantes',
    description: 'Reporte de todos los mensajes entrantes a la fecha',
    columns: [
      { field: 'de', header: 'De' },
      { field: 'para', header: 'Para' },
      { field: 'canal', header: 'Canal' },
      { field: 'mensaje', header: 'Mensaje' },
      { field: 'fecha', header: 'Fecha' },
      { field: 'hora', header: 'Hora' }
    ],
    async fetchData() {
      const { rows } = await query(
        `SELECT de, para, canal, mensaje, fecha, hora
         FROM public.entrantes
         WHERE created_at >= (NOW() - INTERVAL '60 days')
         ORDER BY created_at DESC`
      );
      return rows;
    }
  },
  {
    id: 2,
    key: 'campania',
    name: 'Reporte Campaña',
    description: 'Reporte de casos procesados de la campaña actual',
    requiresBase: true,
    columns: [
      { field: 'desde', header: 'Desde' },
      { field: 'para', header: 'Para' },
      { field: 'mensaje', header: 'Mensaje' },
      { field: 'canal', header: 'Canal' },
      { field: 'campania', header: 'Campaña' },
      { field: 'fecha', header: 'Fecha' },
      { field: 'hora', header: 'Hora' },
      { field: 'estado', header: 'Estado' },
      { field: 'validacion', header: 'Validación' }
    ],
    async fetchData({ base }) {
      const tableName = `public.envios${base}`;
      const { rows } = await query(
        `SELECT desde, para, mensaje, canal, campania, fecha, hora, estado, validacion
         FROM ${tableName}
         WHERE estado IS NOT NULL`
      );
      return rows;
    }
  },
  {
    id: 3,
    key: 'historico',
    name: 'Reporte Histórico',
    description: 'Reporte de todos los casos procesados (No incluye campaña actual)',
    columns: [
      { field: 'desde', header: 'Desde' },
      { field: 'para', header: 'Para' },
      { field: 'mensaje', header: 'Mensaje' },
      { field: 'canal', header: 'Canal' },
      { field: 'campania', header: 'Campaña' },
      { field: 'fecha', header: 'Fecha' },
      { field: 'hora', header: 'Hora' },
      { field: 'estado', header: 'Estado' },
      { field: 'validacion', header: 'Validación' }
    ],
    async fetchData() {
      const { rows } = await query(
        `SELECT desde, para, mensaje, canal, campania, fecha, hora, estado, validacion
         FROM public.historico
         WHERE fecha >= (CURRENT_DATE - INTERVAL '60 days')`
      );
      return rows;
    }
  },
  {
    id: 4,
    key: 'canales',
    name: 'Reporte Canales',
    description: 'Balance general de envíos por canal',
    columns: [
      { field: 'telefono', header: 'Teléfono' },
      { field: 'enviado', header: 'Enviado', formatter: (value) => Number(value ?? 0) },
      { field: 'no_enviado', header: 'No enviado', formatter: (value) => Number(value ?? 0) },
      { field: 'total', header: 'Total', formatter: (value) => Number(value ?? 0) }
    ],
    async fetchData() {
      const { rows } = await query(
        `WITH combined AS (
           SELECT desde, estado FROM public.historico
           UNION ALL
           ${ENVIOS_UNION_QUERY}
         )
         SELECT
           COALESCE(desde, '') AS telefono,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(estado, '')) = 'enviado') AS enviado,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(estado, '')) = 'no enviado') AS no_enviado,
           COUNT(*) AS total
         FROM combined
         WHERE COALESCE(desde, '') <> ''
         GROUP BY telefono
         ORDER BY telefono`
      );
      return rows.map((row) => ({
        telefono: row.telefono,
        enviado: Number(row.enviado ?? 0),
        no_enviado: Number(row.no_enviado ?? 0),
        total: Number(row.total ?? 0)
      }));
    }
  }
];

const REPORTS_BY_KEY = REPORT_DEFINITIONS.reduce((acc, report) => {
  acc[report.key] = report;
  return acc;
}, {});

export async function listExecutions(_req, res) {
  try {
    const { rows } = await query(
      `SELECT idrun, usuario, reporte, estado, create_at
       FROM ejecuciones
       ORDER BY create_at DESC
       LIMIT 10`
    );

    const executions = rows.map((row) => ({
      idrun: row.idrun,
      usuario: row.usuario,
      reporte: row.reporte,
      estado: row.estado,
      createAt: row.create_at
    }));

    return res.json(executions);
  } catch (error) {
    logger.error('Error obteniendo ejecuciones de reportes:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las ejecuciones.' });
  }
}

export async function runReport(req, res) {
  const { reportKey, base } = req.body;
  const normalizedKey = typeof reportKey === 'string' ? reportKey.trim() : '';
  const report = REPORTS_BY_KEY[normalizedKey];

  if (!report) {
    return res.status(400).json({ message: 'Reporte inválido.' });
  }

  let selectedBase = null;

  if (report.requiresBase) {
    const parsedBase = Number(base);
    if (!Number.isInteger(parsedBase) || parsedBase < 1 || parsedBase > 9) {
      return res.status(400).json({ message: 'Seleccione una base de datos para continuar.' });
    }
    selectedBase = parsedBase;
  }

  const username = req.user?.username || 'desconocido';
  let executionId;

  try {
    const insertResult = await query(
      `INSERT INTO ejecuciones (usuario, reporte, estado)
       VALUES ($1, $2, 'iniciado')
       RETURNING idrun`,
      [username, report.name]
    );

    executionId = insertResult.rows[0]?.idrun;

    if (!executionId) {
      throw new Error('No se pudo crear el registro de ejecución.');
    }

    await updateExecutionStatus(executionId, 'ejecutando');

    const data = await report.fetchData({ base: selectedBase });
    const buffer = buildWorkbookBuffer(data, report.columns);

    await ensureReportsDir();
    const filePath = path.join(REPORTS_DIR, `rpt${executionId}.xlsx`);
    await fs.writeFile(filePath, buffer);

    await updateExecutionStatus(executionId, 'completado');
    await pruneOldExecutions();

    return res.json({ idrun: executionId, estado: 'completado' });
  } catch (error) {
    logger.error('No se pudo ejecutar el reporte:', error);

    if (executionId) {
      await updateExecutionStatus(executionId, 'fallido');
    }

    return res.status(500).json({ message: 'No se pudo ejecutar el reporte.' });
  }
}

export async function downloadReport(req, res) {
  const idrun = Number(req.params.idrun);
  if (!Number.isInteger(idrun) || idrun <= 0) {
    return res.status(400).json({ message: 'Identificador inválido.' });
  }

  const filePath = path.join(REPORTS_DIR, `rpt${idrun}.xlsx`);

  try {
    await fs.access(filePath);
  } catch (error) {
    return res.status(404).json({ message: 'Reporte no encontrado.' });
  }

  return res.download(filePath, `rpt${idrun}.xlsx`, (err) => {
    if (err) {
      logger.error('No se pudo descargar el reporte:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'No se pudo descargar el reporte.' });
      }
    }
  });
}

export function listAvailableReports(_req, res) {
  const payload = REPORT_DEFINITIONS.map(({ id, key, name, description, requiresBase }) => ({
    id,
    key,
    name,
    description,
    requiresBase: Boolean(requiresBase)
  }));
  return res.json(payload);
}
