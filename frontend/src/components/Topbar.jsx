import { useEffect, useRef, useState } from 'react';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { updateProfile } from '../api/user.js';
import { useAuth } from '../context/AuthContext.jsx';
import ProfileModal from './ProfileModal.jsx';
import NotificationsModal from './NotificationsModal.jsx';
import './Topbar.css';

export default function Topbar() {
  const { user, logout, theme, updateStoredUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeLoading, setThemeLoading] = useState(false);
  const [themeError, setThemeError] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const controlsRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handleClick = (event) => {
      if (controlsRef.current && !controlsRef.current.contains(event.target)) {
        setMenuOpen(false);
        setThemeError(null);
      }
    };

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setThemeError(null);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    setThemeError(null);
  };

  const handleToggleTheme = async () => {
    if (themeLoading) return;

    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeLoading(true);
    setThemeError(null);

    try {
      const updated = await updateProfile({ theme: nextTheme });
      updateStoredUser(updated);
    } catch (error) {
      console.error('No se pudo cambiar el tema:', error);
      setThemeError('No se pudo cambiar el tema. Intenta nuevamente.');
    } finally {
      setThemeLoading(false);
    }
  };

  const handleOpenProfile = () => {
    closeMenu();
    setNotificationsOpen(false);
    setProfileOpen(true);
  };

  const handleCloseProfile = () => {
    setProfileOpen(false);
  };

  const handleOpenNotifications = () => {
    closeMenu();
    setProfileOpen(false);
    setNotificationsOpen(true);
  };

  const handleCloseNotifications = () => {
    setNotificationsOpen(false);
  };

  const handleLogout = () => {
    closeMenu();
    setProfileOpen(false);
    setNotificationsOpen(false);
    logout();
  };

  const themeLabel = theme === 'dark' ? 'Tema Claro' : 'Tema Oscuro';

  return (
    <header className="topbar">
      <div className="topbar__title">Panel de control</div>
      <div className="topbar__controls" ref={controlsRef}>
        <span className="topbar__username">{user?.name || user?.username}</span>
        <button
          type="button"
          className="topbar__menu-button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          <Bars3Icon className="topbar__menu-icon" />
        </button>
        {menuOpen ? (
          <div className="topbar__menu" role="menu">
            <button type="button" className="topbar__menu-item" onClick={handleOpenProfile} role="menuitem">
              Perfil
            </button>
            <button
              type="button"
              className="topbar__menu-item"
              onClick={handleToggleTheme}
              disabled={themeLoading}
              role="menuitem"
            >
              {themeLoading ? 'Cambiando tema…' : themeLabel}
            </button>
            <button
              type="button"
              className="topbar__menu-item"
              onClick={handleOpenNotifications}
              role="menuitem"
            >
              Notificaciones
            </button>
            <button
              type="button"
              className="topbar__menu-item topbar__menu-item--danger"
              onClick={handleLogout}
              role="menuitem"
            >
              Cerrar sesión
            </button>
            {themeError ? <div className="topbar__menu-message">{themeError}</div> : null}
          </div>
        ) : null}
      </div>
      {profileOpen ? <ProfileModal onClose={handleCloseProfile} /> : null}
      {notificationsOpen ? <NotificationsModal onClose={handleCloseNotifications} /> : null}
    </header>
  );
}
