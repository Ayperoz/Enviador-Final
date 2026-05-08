import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { uploadData, fetchUploads } from '../api/data.js';
import './DataPage.css';

const BASE_OPTIONS = Array.from({ length: 9 }, (_value, index) => String(index + 1));
const PREVIEW_LIMIT = 10;
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short'
});

function normalizeHeader(value) {
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

async function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsArrayBuffer(file);
  });
}

function parsePreview(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
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
    return { total: 0, preview: [] };
  }

  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map(normalizeHeader);

  if (headers[0] !== 'telefono' || headers[1] !== 'mensaje') {
    throw new Error('El archivo debe contener las columnas "telefono" y "mensaje" en la primera fila.');
  }

  const entries = dataRows
    .filter(Array.isArray)
    .map((row) => ({
      telefono: normalizeCell(row[0]),
      mensaje: normalizeCell(row[1])
    }))
    .filter((row) => row.telefono);

  return {
    total: entries.length,
    preview: entries.slice(0, PREVIEW_LIMIT)
  };
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return DATE_TIME_FORMATTER.format(date);
}

export default function DataPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBase, setSelectedBase] = useState(BASE_OPTIONS[0]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [recordCount, setRecordCount] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const fileInputRef = useRef(null);

  const resetForm = useCallback(() => {
    setSelectedFile(null);
    setPreviewRows([]);
    setRecordCount(0);
    setIsParsing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const loadUploads = useCallback(async () => {
    try {
      const data = await fetchUploads();
      setUploads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadUploads();
  }, [loadUploads]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setIsConfirmOpen(false);
    resetForm();
  }, [resetForm]);

  const handleOpenModal = () => {
    resetForm();
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleBaseChange = (event) => {
    setSelectedBase(event.target.value);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      resetForm();
      return;
    }

    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!['xls', 'xlsx'].includes(extension)) {
      resetForm();
      setError('Solo se permiten archivos Excel (.xls, .xlsx).');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsParsing(true);

    try {
      const buffer = await readFileAsArrayBuffer(file);
      const { preview, total } = parsePreview(buffer);
      setSelectedFile(file);
      setPreviewRows(preview);
      setRecordCount(total);
      setIsParsing(false);
      if (total === 0) {
        setError('El archivo no contiene registros válidos para cargar.');
      }
    } catch (err) {
      console.error(err);
      resetForm();
      setError(err.message || 'No se pudo leer el archivo seleccionado.');
    }
  };

  const handleUploadClick = () => {
    if (!selectedFile) {
      setError('Selecciona un archivo Excel para continuar.');
      return;
    }

    if (recordCount === 0) {
      setError('No hay registros válidos para cargar.');
      return;
    }

    setError(null);
    setIsConfirmOpen(true);
  };

  const handleConfirmCancel = () => {
    if (!loading) {
      setIsConfirmOpen(false);
    }
  };

  const handleConfirmAccept = async () => {
    if (!selectedFile) {
      setIsConfirmOpen(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await uploadData(selectedBase, selectedFile);
      const message = response?.message || `Se cargaron ${recordCount} registros en la base ${selectedBase}.`;
      setSuccess(message);
      await loadUploads();
      closeModal();
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.message || 'No se pudo completar la carga de datos.';
      setError(message);
      setSuccess(null);
    } finally {
      setLoading(false);
      setIsConfirmOpen(false);
    }
  };

  return (
    <div className="data-page">
      <div className="data-page__header">
        <div>
          <h1>Datos</h1>
          <p>Administra las bases de envío y consulta el historial de cargas.</p>
        </div>
        <button
          className="data-page__button"
          type="button"
          onClick={handleOpenModal}
          disabled={isModalOpen}
        >
          Cargar Datos
        </button>
      </div>

      {error && <div className="data-page__alert data-page__alert--error">{error}</div>}
      {success && <div className="data-page__alert data-page__alert--success">{success}</div>}

      {isModalOpen && (
        <div className="data-upload-modal" role="dialog" aria-modal="true">
          <div className="data-upload-modal__content">
            <header className="data-upload-modal__header">
              <div>
                <h2>Cargar datos</h2>
                <p>Selecciona la base y el archivo Excel para comenzar la carga.</p>
              </div>
              <button
                type="button"
                className="data-upload-modal__close"
                onClick={closeModal}
                aria-label="Cerrar"
                disabled={loading}
              >
                ×
              </button>
            </header>
            <form className="data-upload-form" onSubmit={(event) => {
              event.preventDefault();
              handleUploadClick();
            }}>
              <div className="data-upload-form__row">
                <label className="data-upload-form__field">
                  <span>Base</span>
                  <select value={selectedBase} onChange={handleBaseChange} disabled={loading || isParsing}>
                    {BASE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="data-upload-form__file">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={handleFileChange}
                    hidden
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="data-upload-form__file-button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    Seleccionar Archivo
                  </button>
                  <span className="data-upload-form__file-name">
                    {selectedFile ? <strong>{selectedFile.name}</strong> : 'Ningún archivo seleccionado'}
                  </span>
                </div>
              </div>

              {isParsing && <div className="data-upload-form__loading">Procesando archivo...</div>}
              {loading && !isParsing && (
                <div className="data-upload-form__loading">Cargando datos en la base...</div>
              )}

              {previewRows.length > 0 && (
                <>
                  <div className="data-preview__header">
                    <span>
                      Vista Previa del archivo
                      {recordCount > 0 && <small> ({recordCount} registros)</small>}
                    </span>
                    <button type="submit" className="data-upload-form__submit" disabled={loading}>
                      Cargar Datos
                    </button>
                  </div>
                  <div className="data-preview__table-wrapper">
                    <table className="data-preview__table">
                      <thead>
                        <tr>
                          <th>Teléfono</th>
                          <th>Mensaje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, index) => (
                          <tr key={`${row.telefono}-${index}`}>
                            <td>{row.telefono}</td>
                            <td>{row.mensaje || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <footer className="data-upload-modal__footer">
                <button type="button" className="data-upload-modal__secondary" onClick={closeModal} disabled={loading}>
                  Cancelar
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      <div className="data-page__card">
        <div className="data-history">
          <div className="data-history__header">
            <h2>Historial de ejecuciónes</h2>
          </div>

          {uploads.length === 0 ? (
            <div className="data-history__empty">Aún no hay cargas registradas.</div>
          ) : (
            <div className="data-history__table-wrapper">
              <table className="data-history__table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Base</th>
                    <th>Fecha y hora</th>
                    <th>Registros</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.base}</td>
                      <td>{formatDateTime(item.fecha)}</td>
                      <td>{item.registros?.toLocaleString('es-AR')}</td>
                      <td>{item.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isConfirmOpen && (
        <div className="data-confirm">
          <div className="data-confirm__content">
            <p>
              ¿Está seguro que quiere agregar {recordCount.toLocaleString('es-AR')} registros a la base {selectedBase}?
            </p>
            <div className="data-confirm__actions">
              <button
                type="button"
                className="data-confirm__secondary"
                onClick={handleConfirmCancel}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="data-confirm__primary"
                onClick={handleConfirmAccept}
                disabled={loading}
              >
                {loading ? 'Procesando…' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
