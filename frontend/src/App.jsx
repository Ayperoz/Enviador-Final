import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import ChannelsPage from './pages/ChannelsPage.jsx';
import CampaignsPage from './pages/CampaignsPage.jsx';
import DataPage from './pages/DataPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import MonitorPage from './pages/MonitorPage.jsx';
import ConfigurationPage from './pages/ConfigurationPage.jsx';
import NormalizerPage from './pages/NormalizerPage.jsx';
import RoleControlPage from './pages/RoleControlPage.jsx';
import SessionTimeoutModal from './components/SessionTimeoutModal.jsx';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function SessionTimeoutOverlay() {
  const { showTimeoutModal, dismissTimeoutModal, logoutReason } = useAuth();
  if (!showTimeoutModal) {
    return null;
  }
  return <SessionTimeoutModal onClose={dismissTimeoutModal} reason={logoutReason} />;
}

function NormalizerRoute() {
  const { settings } = useAuth();

  if (!settings) {
    return (
      <div className="placeholder">
        <h1>Cargando configuración…</h1>
      </div>
    );
  }

  if (!settings.normalizerEnabled) {
    return <Navigate to="/canales" replace />;
  }

  return <NormalizerPage />;
}

function AdminRoute({ children }) {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/canales" replace />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <SessionTimeoutOverlay />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={(
            <PrivateRoute>
              <DashboardLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/canales" replace />} />
                  <Route path="/canales" element={<ChannelsPage />} />
                  <Route path="/campanas" element={<CampaignsPage />} />
                  <Route path="/datos" element={<DataPage />} />
                  <Route path="/monitor" element={<MonitorPage />} />
                  <Route path="/reportes" element={<ReportsPage />} />
                  <Route path="/normalizador" element={<NormalizerRoute />} />
                  <Route path="/faq" element={<ConfigurationPage />} />
                  <Route
                    path="/configuracion"
                    element={(
                      <AdminRoute>
                        <RoleControlPage />
                      </AdminRoute>
                    )}
                  />
                  <Route path="/control-roles" element={<Navigate to="/configuracion" replace />} />
                </Routes>
              </DashboardLayout>
            </PrivateRoute>
          )}
        />
      </Routes>
    </AuthProvider>
  );
}
