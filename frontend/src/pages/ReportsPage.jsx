import { useEffect, useMemo, useState } from 'react';
import {
  downloadReport,
  fetchReportCatalog,
  fetchReportExecutions,
  runReport as runReportRequest
} from '../api/reports.js';
import BaseSelectionModal from '../components/reports/BaseSelectionModal.jsx';
import './ReportsPage.css';

const FALLBACK_REPORTS = [
  {
    id: 1,
    key: 'entrantes',
    name: 'Reporte Entrantes',
    description: 'Reporte de todos los mensajes entrantes a la fecha'
  },
  {
    id: 2,
    key: 'campania',
    name: 'Reporte Campaña',
    description: 'Reporte de casos procesados de la campaña actual',
    requiresBase: true
  },
  {
    id: 3,
    key: 'historico',
    name: 'Reporte Histórico',
    description: 'Reporte de todos los casos procesados (No incluye campaña actual)'
  },
  {
    id: 4,
    key: 'canales',
    name: 'Reporte Canales',
    description: 'Balance general de envíos por canal'
  }
];

const TAB_OPTIONS = [
  { key: 'run', label: 'Ejecutar Reporte' },
  { key: 'history', label: 'Ejecuciones' }
];

function extractFilename(disposition) {
  if (!disposition) {
    return null;
  }

  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch) {
    try {
      return decodeURIComponent(utfMatch[1].replace(/"/g, ''));
    } catch (_error) {
      // Ignore decoding issues and fall through to the generic match.
    }
  }

  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (asciiMatch) {
    return asciiMatch[1];
  }

  return null;
}

function formatStatus(status) {
  if (!status) return '-';
  const normalized = status.toString();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('run');
  const [reports, setReports] = useState(FALLBACK_REPORTS);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [executionsError, setExecutionsError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [runningReportKey, setRunningReportKey] = useState(null);
  const [showBaseModal, setShowBaseModal] = useState(false);
  const [pendingReport, setPendingReport] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function loadCatalog() {
      try {
        const data = await fetchReportCatalog();
        if (!ignore && Array.isArray(data) && data.length > 0) {
          const ordered = [...data].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
          setReports(ordered);
        }
      } catch (error) {
        console.error('No se pudo cargar el catálogo de reportes:', error);
        if (!ignore) {
          setCatalogError('No se pudo cargar el listado de reportes. Se mostrará la configuración predeterminada.');
        }
      } finally {
        if (!ignore) {
          setCatalogLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    loadExecutions();
  }, []);

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
    [reports]
  );

  async function loadExecutions() {
    setExecutionsLoading(true);
    setExecutionsError(null);
    try {
      const data = await fetchReportExecutions();
      if (Array.isArray(data)) {
        setExecutions(data);
      }
    } catch (error) {
      console.error('No se pudieron obtener las ejecuciones:', error);
      setExecutionsError('No se pudieron cargar las últimas ejecuciones.');
    } finally {
      setExecutionsLoading(false);
    }
  }

  const handleRunClick = (report) => {
    if (runningReportKey) {
      return;
    }
    setFeedback(null);
    if (report.requiresBase) {
      setPendingReport(report);
      setShowBaseModal(true);
      return;
    }
    executeReport(report.key);
  };

  const executeReport = async (reportKey, options = {}) => {
    setRunningReportKey(reportKey);
    setFeedback(null);
    try {
      await runReportRequest({ reportKey, ...options });
      setFeedback({ type: 'success', message: 'Reporte ejecutado correctamente.' });
      await loadExecutions();
      setActiveTab('history');
    } catch (error) {
      console.error('Error al ejecutar el reporte:', error);
      const message = error?.response?.data?.message || 'No se pudo ejecutar el reporte.';
      setFeedback({ type: 'error', message });
    } finally {
      setRunningReportKey(null);
    }
  };

  const handleBaseConfirm = async (baseValue) => {
    if (!pendingReport) {
      return;
    }
    const reportKey = pendingReport.key;
    setShowBaseModal(false);
    setPendingReport(null);
    await executeReport(reportKey, { base: baseValue });
  };

  const handleBaseCancel = () => {
    setShowBaseModal(false);
    setPendingReport(null);
  };

  const handleDownload = async (execution) => {
    setFeedback(null);
    try {
      const response = await downloadReport(execution.idrun);
      const blob = new Blob([response.data], {
        type:
          response.headers['content-type'] ||
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const fallbackName = `rpt${execution.idrun}.xlsx`;
      const fileName = extractFilename(response.headers['content-disposition']) || fallbackName;
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo descargar el reporte:', error);
      setFeedback({ type: 'error', message: 'No se pudo descargar el reporte.' });
    }
  };

  return (
    <div className="reports-page">
      <header className="reports-page__header">
        <div>
          <h1 className="reports-page__title">Reportes</h1>
          <p className="reports-page__subtitle">
            Ejecutá consultas clave y descarga los resultados en formato Excel.
          </p>
        </div>
      </header>

      <div role="tablist" aria-label="Reportes" className="reports-page__tabs">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`reports-page__tab ${activeTab === tab.key ? 'reports-page__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {catalogError ? (
        <div className="reports-page__feedback reports-page__feedback--warning">{catalogError}</div>
      ) : null}
      {feedback ? (
        <div
          className={`reports-page__feedback ${
            feedback.type === 'success'
              ? 'reports-page__feedback--success'
              : 'reports-page__feedback--error'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="reports-page__section" hidden={activeTab !== 'run'}>
        {catalogLoading && !reports.length ? (
          <div className="reports-page__empty">Cargando reportes…</div>
        ) : (
          <div className="reports-page__table-wrapper">
            <table className="reports-page__table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedReports.map((report) => (
                  <tr key={report.key}>
                    <td>{report.id}</td>
                    <td>{report.name}</td>
                    <td>{report.description}</td>
                    <td>
                      <button
                        type="button"
                        className="reports-page__action"
                        onClick={() => handleRunClick(report)}
                        disabled={runningReportKey === report.key}
                      >
                        {runningReportKey === report.key ? 'Ejecutando…' : 'Ejecutar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="reports-page__section" hidden={activeTab !== 'history'}>
        <div className="reports-page__table-wrapper">
          <table className="reports-page__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Reporte</th>
                <th>Usuario</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {executionsLoading ? (
                <tr>
                  <td colSpan={6} className="reports-page__empty">Cargando ejecuciones…</td>
                </tr>
              ) : executions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="reports-page__empty">
                    {executionsError || 'Aún no hay ejecuciones registradas.'}
                  </td>
                </tr>
              ) : (
                executions.map((execution) => (
                  <tr key={execution.idrun}>
                    <td>{execution.idrun}</td>
                    <td>{execution.reporte}</td>
                    <td>{execution.usuario}</td>
                    <td>{formatStatus(execution.estado)}</td>
                    <td>{formatDateTime(execution.createAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="reports-page__action"
                        onClick={() => handleDownload(execution)}
                        disabled={execution.estado !== 'completado'}
                      >
                        Descargar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showBaseModal && pendingReport ? (
        <BaseSelectionModal
          key={pendingReport.key}
          reportName={pendingReport.name}
          loading={runningReportKey === pendingReport.key}
          onCancel={handleBaseCancel}
          onConfirm={handleBaseConfirm}
        />
      ) : null}
    </div>
  );
}
