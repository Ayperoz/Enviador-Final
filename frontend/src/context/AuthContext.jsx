import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loginRequest } from '../api/auth.js';
import { getSettings as fetchSettings } from '../api/settings.js';
import { UNAUTHORIZED_EVENT } from '../api/axios.js';

const AuthContext = createContext();

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'enviador:last-activity';
const DEFAULT_THEME = 'light';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [settings, setSettings] = useState(null);
  const [logoutReason, setLogoutReason] = useState(null);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const timeoutRef = useRef(null);

  const applyTheme = useCallback((themeValue) => {
    const normalized = themeValue || DEFAULT_THEME;
    document.body.dataset.theme = normalized;
  }, []);

  useEffect(() => {
    applyTheme(user?.theme || DEFAULT_THEME);
  }, [applyTheme, user?.theme]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  const clearInactivityTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const loadSettings = useCallback(
    async (authToken = null) => {
      const effectiveToken = authToken || token;

      if (!effectiveToken) {
        setSettings(null);
        return null;
      }

      try {
        const config = authToken
          ? {
              headers: {
                Authorization: `Bearer ${authToken}`
              }
            }
          : undefined;
        const data = await fetchSettings(config);
        setSettings(data);
        return data;
      } catch (error) {
        console.error('frontend - Error al obtener la configuración:', error);
        setSettings(null);
        throw error;
      }
    },
    [token]
  );

  const login = async (credentials) => {
    try {
      const data = await loginRequest(credentials);
      setToken(data.token);
      setUser(data.user);
      applyTheme(data.user?.theme || DEFAULT_THEME);
      setLogoutReason(null);
      setShowTimeoutModal(false);
      scheduleInactivityTimer();

      try {
        await loadSettings(data.token);
      } catch (error) {
        console.error('frontend - No se pudo sincronizar la configuración:', error);
      }

      const displayName = data.user?.name || data.user?.username || credentials?.username || 'Usuario';
      console.info(`frontend - Usuario "${displayName}" Iniciado correctamente`);
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Error desconocido';
      console.error(`frontend - Error al iniciar sesión: Err ${message}`);
      throw error;
    }
  };

  const logout = useCallback(
    (reason = null) => {
      clearInactivityTimer();
      setToken(null);
      setUser((prev) => {
        if (prev) {
          const displayName = prev.name || prev.username || 'Usuario';
          console.info(`frontend - Usuario "${displayName}" LogOut`);
        }
        return null;
      });
      setSettings(null);
      applyTheme(DEFAULT_THEME);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      if (reason === 'timeout' || reason === 'remote') {
        setLogoutReason(reason);
        setShowTimeoutModal(true);
      } else {
        setLogoutReason(reason);
        setShowTimeoutModal(false);
      }
    },
    [applyTheme, clearInactivityTimer]
  );

  const scheduleInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    if (!token) {
      return;
    }

    const now = Date.now();
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    timeoutRef.current = setTimeout(() => {
      logout('timeout');
    }, INACTIVITY_LIMIT_MS);
  }, [clearInactivityTimer, logout, token]);

  const registerActivity = useCallback(() => {
    if (!token) {
      return;
    }
    setLogoutReason(null);
    setShowTimeoutModal(false);
    scheduleInactivityTimer();
  }, [scheduleInactivityTimer, token]);

  useEffect(() => {
    if (!token) {
      clearInactivityTimer();
      setSettings(null);
      return;
    }

    scheduleInactivityTimer();

    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, registerActivity, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        registerActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleStorage = (event) => {
      if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
        const lastActivity = Number(event.newValue);
        if (!Number.isNaN(lastActivity) && Date.now() - lastActivity < INACTIVITY_LIMIT_MS) {
          scheduleInactivityTimer();
        }
      }

      if (event.key === 'token' && !event.newValue) {
        logout();
      }
    };

    window.addEventListener('storage', handleStorage);

    const handleRemoteLogout = (event) => {
      const message = event?.detail?.message;
      if (message === 'La sesión ha sido cerrada desde otro dispositivo.') {
        logout('remote');
      } else {
        logout();
      }
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleRemoteLogout);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, registerActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(UNAUTHORIZED_EVENT, handleRemoteLogout);
    };
  }, [
    clearInactivityTimer,
    loadSettings,
    logout,
    registerActivity,
    scheduleInactivityTimer,
    token
  ]);

  useEffect(() => {
    if (!token) {
      return;
    }

    loadSettings().catch((error) => {
      console.error('frontend - No se pudo cargar la configuración inicial:', error);
    });
  }, [loadSettings, token]);

  const dismissTimeoutModal = useCallback(() => {
    setShowTimeoutModal(false);
    setLogoutReason(null);
  }, []);

  const updateStoredUser = useCallback(
    (updates) => {
      setUser((prev) => {
        if (!prev) {
          return prev;
        }
        const next = { ...prev, ...updates };
        applyTheme(next.theme || DEFAULT_THEME);
        return next;
      });
    },
    [applyTheme]
  );

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      login,
      logout,
      logoutReason,
      showTimeoutModal,
      dismissTimeoutModal,
      registerActivity,
      theme: user?.theme || DEFAULT_THEME,
      updateStoredUser,
      settings,
      refreshSettings: loadSettings
    }),
    [
      dismissTimeoutModal,
      loadSettings,
      login,
      logout,
      logoutReason,
      registerActivity,
      showTimeoutModal,
      token,
      updateStoredUser,
      user,
      settings
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider');
  }
  return context;
}
