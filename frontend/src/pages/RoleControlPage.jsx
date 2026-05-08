import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { updateSettings } from '../api/settings.js';
import {
  fetchUsers,
  createUser as createUserRequest,
  updateUser as updateUserRequest,
  deleteUser as deleteUserRequest
} from '../api/user.js';
import './RoleControlPage.css';

const DEFAULT_USER_FORM_VALUES = {
  username: '',
  password: '',
  confirmPassword: '',
  role: 'user',
  theme: 'light'
};

/**
 * Pantalla administrativa para:
 * 1) configurar límites operativos (canales/campañas/calentadores/normalizador),
 * 2) crear, editar y eliminar usuarios del sistema.
 */
export default function RoleControlPage() {
  const { user: currentUser, settings, refreshSettings, updateStoredUser } = useAuth();
  const [formValues, setFormValues] = useState({
    channelLimit: '',
    warmersLimit: '',
    campaignLimit: '',
    preResponsesLimit: '',
    normalizerEnabled: false
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [showUserForm, setShowUserForm] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [userFormValues, setUserFormValues] = useState(() => ({ ...DEFAULT_USER_FORM_VALUES }));
  const [userFormError, setUserFormError] = useState(null);
  const [userFormSaving, setUserFormSaving] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setFormValues({
      channelLimit: settings.channelLimit != null ? String(settings.channelLimit) : '',
      warmersLimit: settings.warmersLimit != null ? String(settings.warmersLimit) : '',
      campaignLimit: settings.campaignLimit != null ? String(settings.campaignLimit) : '',
      preResponsesLimit: settings.preResponsesLimit != null ? String(settings.preResponsesLimit) : '',
      normalizerEnabled: Boolean(settings.normalizerEnabled)
    });
  }, [settings]);

  // Carga la grilla de usuarios disponibles para gestión administrativa.
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
      setUsersError(null);
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.message || 'No se pudieron cargar los usuarios.';
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  if (currentUser?.role !== 'admin') {
    return <Navigate to="/canales" replace />;
  }

  if (!settings) {
    return (
      <div className="role-control role-control--loading">
        Cargando configuración...
      </div>
    );
  }

  // Mantiene sincronizados los campos numéricos del formulario de configuración.
  const handleNumberChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  // Activa o desactiva la visibilidad de la pestaña Normalizador.
  const handleToggleChange = (event) => {
    const { checked } = event.target;
    setFormValues((prev) => ({ ...prev, normalizerEnabled: checked }));
  };

  // Valida y persiste la configuración general del sistema.
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const channelLimit = Number.parseInt(formValues.channelLimit, 10);
    if (!Number.isFinite(channelLimit) || channelLimit <= 0) {
      setError('La cantidad de canales debe ser un número mayor a cero.');
      return;
    }

    let warmersLimit;
    if (formValues.warmersLimit === '') {
      warmersLimit = channelLimit;
    } else {
      warmersLimit = Number.parseInt(formValues.warmersLimit, 10);
      if (!Number.isFinite(warmersLimit) || warmersLimit < 0) {
        setError('La cantidad de calentadores debe ser cero o un número positivo.');
        return;
      }
    }

    const campaignLimit = Number.parseInt(formValues.campaignLimit, 10);
    if (!Number.isFinite(campaignLimit) || campaignLimit <= 0) {
      setError('La cantidad de campañas debe ser un número mayor a cero.');
      return;
    }

    const preResponsesLimit = Number.parseInt(formValues.preResponsesLimit, 10);
    if (!Number.isFinite(preResponsesLimit) || preResponsesLimit <= 0) {
      setError('La cantidad de preguntas aleatorias debe ser un número mayor a cero.');
      return;
    }

    if (warmersLimit > channelLimit) {
      setError('La cantidad de calentadores no puede superar la cantidad de canales.');
      return;
    }

    setSaving(true);

    try {
      const updated = await updateSettings({
        channelLimit,
        warmersLimit,
        campaignLimit,
        preResponsesLimit,
        normalizerEnabled: formValues.normalizerEnabled
      });

      setFormValues({
        channelLimit: updated.channelLimit != null ? String(updated.channelLimit) : '',
        warmersLimit: updated.warmersLimit != null ? String(updated.warmersLimit) : '',
        campaignLimit: updated.campaignLimit != null ? String(updated.campaignLimit) : '',
        preResponsesLimit: updated.preResponsesLimit != null ? String(updated.preResponsesLimit) : '',
        normalizerEnabled: Boolean(updated.normalizerEnabled)
      });

      setSuccess('Configuración actualizada correctamente.');
      await refreshSettings();
    } catch (err) {
      const message = err?.response?.data?.message || 'No se pudo guardar la configuración.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // Inicializa el formulario en modo "crear usuario".
  const openCreateUserForm = () => {
    setEditingUser(null);
    setUserFormValues({ ...DEFAULT_USER_FORM_VALUES });
    setUserFormError(null);
    setShowUserForm(true);
  };

  // Inicializa el formulario en modo edición con los datos del usuario seleccionado.
  const openEditUserForm = (userToEdit) => {
    setEditingUser(userToEdit);
    setUserFormValues({
      username: userToEdit.username || '',
      password: '',
      confirmPassword: '',
      role: userToEdit.role || 'user',
      theme: userToEdit.theme || 'light'
    });
    setUserFormError(null);
    setShowUserForm(true);
  };

  // Cierra y resetea el formulario de alta/edición de usuarios.
  const closeUserForm = () => {
    setShowUserForm(false);
    setEditingUser(null);
    setUserFormValues({ ...DEFAULT_USER_FORM_VALUES });
    setUserFormError(null);
  };

  // Actualiza los campos del formulario de usuario.
  const handleUserFormChange = (event) => {
    const { name, value } = event.target;
    setUserFormValues((prev) => ({ ...prev, [name]: value }));
  };

  // Crea o actualiza un usuario según el modo actual del formulario.
  const handleUserFormSubmit = async (event) => {
    event.preventDefault();
    setUserFormError(null);

    const trimmedUsername = userFormValues.username.trim();
    if (!trimmedUsername) {
      setUserFormError('El usuario es obligatorio.');
      return;
    }

    if (!editingUser && !userFormValues.password) {
      setUserFormError('La contraseña es obligatoria.');
      return;
    }

    if (userFormValues.password !== userFormValues.confirmPassword) {
      setUserFormError('Las contraseñas no coinciden.');
      return;
    }

    if (!['admin', 'user'].includes(userFormValues.role)) {
      setUserFormError('Rol inválido.');
      return;
    }

    if (!['light', 'dark'].includes(userFormValues.theme)) {
      setUserFormError('Tema inválido.');
      return;
    }

    const payload = {
      username: trimmedUsername,
      role: userFormValues.role,
      theme: userFormValues.theme
    };

    if (editingUser) {
      if (userFormValues.password) {
        payload.password = userFormValues.password;
      }
    } else {
      payload.password = userFormValues.password;
      payload.name = trimmedUsername;
    }

    setUserFormSaving(true);

    try {
      const savedUser = editingUser
        ? await updateUserRequest(editingUser.id, payload)
        : await createUserRequest(payload);

      await loadUsers();

      if (savedUser.id === currentUser?.id) {
        updateStoredUser(savedUser);
      }

      closeUserForm();
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.message || 'No se pudo guardar el usuario.';
      setUserFormError(message);
    } finally {
      setUserFormSaving(false);
    }
  };

  // Muestra/oculta la lista de usuarios y la carga al abrirse.
  const handleToggleUsers = () => {
    const nextValue = !showUsers;
    setShowUsers(nextValue);
    if (!showUsers) {
      loadUsers();
    }
  };

  // Elimina un usuario luego de confirmación explícita.
  const handleDeleteUser = async (userToDelete) => {
    if (!window.confirm(`¿Eliminar el usuario "${userToDelete.username}"?`)) {
      return;
    }

    try {
      await deleteUserRequest(userToDelete.id);
      await loadUsers();
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.message || 'No se pudo eliminar el usuario.';
      alert(message);
    }
  };

  return (
    <div className="role-control">
      <div className="role-control__header">
        <h1>Configuración</h1>
        <p>Define los límites del sistema y gestiona los usuarios disponibles.</p>
      </div>

      <form className="role-control__form" onSubmit={handleSubmit}>
        <div className="role-control__grid">
          <label className="role-control__field" htmlFor="channelLimit">
            <span className="role-control__label">Cantidad de canales</span>
            <input
              id="channelLimit"
              name="channelLimit"
              type="number"
              min="1"
              value={formValues.channelLimit}
              onChange={handleNumberChange}
              required
            />
            <small className="role-control__help">
              Límite máximo de conexiones de WhatsApp que podrán configurarse.
            </small>
          </label>

          <label className="role-control__field" htmlFor="warmersLimit">
            <span className="role-control__label">Cantidad de calentadores</span>
            <input
              id="warmersLimit"
              name="warmersLimit"
              type="number"
              min="0"
              value={formValues.warmersLimit}
              onChange={handleNumberChange}
              placeholder={settings.warmersLimit == null ? 'Sin límite (todos habilitados)' : undefined}
            />
            <small className="role-control__help">
              Define cuántos canales mostrarán el botón 'Iniciar'. Deja vacío para habilitarlos a
              todos.
            </small>
          </label>

          <label className="role-control__field" htmlFor="campaignLimit">
            <span className="role-control__label">Cantidad de campañas</span>
            <input
              id="campaignLimit"
              name="campaignLimit"
              type="number"
              min="1"
              value={formValues.campaignLimit}
              onChange={handleNumberChange}
              required
            />
            <small className="role-control__help">
              Número máximo de campañas activas permitidas.
            </small>
          </label>

          <label className="role-control__field" htmlFor="preResponsesLimit">
            <span className="role-control__label">Preguntas aleatorias del calentador</span>
            <input
              id="preResponsesLimit"
              name="preResponsesLimit"
              type="number"
              min="1"
              value={formValues.preResponsesLimit}
              onChange={handleNumberChange}
              required
            />
            <small className="role-control__help">
              Valor máximo para seleccionar una pregunta aleatoria por ID en la base del calentador.
            </small>
          </label>
        </div>

        <div className="role-control__toggle">
          <input
            id="normalizerEnabled"
            name="normalizerEnabled"
            type="checkbox"
            checked={formValues.normalizerEnabled}
            onChange={handleToggleChange}
          />
          <label htmlFor="normalizerEnabled">Mostrar pestaña 'Normalizador' a los usuarios</label>
        </div>

        {error ? <div className="role-control__message role-control__message--error">{error}</div> : null}
        {success ? (
          <div className="role-control__message role-control__message--success">{success}</div>
        ) : null}

        <button type="submit" className="role-control__submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </form>

      <div className="role-control__actions">
        <button type="button" className="role-control__button" onClick={openCreateUserForm}>
          Crear usuario
        </button>
        <button
          type="button"
          className="role-control__button role-control__button--secondary"
          onClick={handleToggleUsers}
        >
          {showUsers ? 'Ocultar usuarios' : 'Ver usuarios'}
        </button>
      </div>

      {showUserForm ? (
        <form className="role-control__form role-control__user-form" onSubmit={handleUserFormSubmit}>
          <div className="role-control__grid role-control__grid--users">
            <label className="role-control__field" htmlFor="user-username">
              <span className="role-control__label">Usuario</span>
              <input
                id="user-username"
                name="username"
                type="text"
                value={userFormValues.username}
                onChange={handleUserFormChange}
                autoComplete="username"
                required
              />
            </label>

            <label className="role-control__field" htmlFor="user-password">
              <span className="role-control__label">Contraseña</span>
              <input
                id="user-password"
                name="password"
                type="password"
                value={userFormValues.password}
                onChange={handleUserFormChange}
                autoComplete="new-password"
                placeholder={editingUser ? 'Dejar en blanco para mantener' : undefined}
                required={!editingUser}
              />
            </label>

            <label className="role-control__field" htmlFor="user-confirm">
              <span className="role-control__label">Repetir contraseña</span>
              <input
                id="user-confirm"
                name="confirmPassword"
                type="password"
                value={userFormValues.confirmPassword}
                onChange={handleUserFormChange}
                autoComplete="new-password"
                placeholder={editingUser ? 'Dejar en blanco para mantener' : undefined}
                required={!editingUser}
              />
            </label>

            <label className="role-control__field" htmlFor="user-role">
              <span className="role-control__label">Tipo de usuario</span>
              <select
                id="user-role"
                name="role"
                value={userFormValues.role}
                onChange={handleUserFormChange}
              >
                <option value="admin">Administrador</option>
                <option value="user">Usuario</option>
              </select>
            </label>

            <label className="role-control__field" htmlFor="user-theme">
              <span className="role-control__label">Tema</span>
              <select
                id="user-theme"
                name="theme"
                value={userFormValues.theme}
                onChange={handleUserFormChange}
              >
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </select>
            </label>
          </div>

          {userFormError ? (
            <div className="role-control__message role-control__message--error">{userFormError}</div>
          ) : null}

          <div className="role-control__form-actions">
            <button type="submit" className="role-control__submit" disabled={userFormSaving}>
              {userFormSaving ? 'Guardando…' : editingUser ? 'Guardar cambios' : 'Crear usuario'}
            </button>
            <button
              type="button"
              className="role-control__button role-control__button--text"
              onClick={closeUserForm}
              disabled={userFormSaving}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {showUsers ? (
        <div className="role-control__card role-control__users-card">
          <div className="role-control__users-header">
            <h2>Usuarios</h2>
            <button
              type="button"
              className="role-control__button role-control__button--secondary role-control__button--small"
              onClick={loadUsers}
              disabled={usersLoading}
            >
              {usersLoading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {usersLoading ? (
            <div className="role-control__users-empty">Cargando usuarios…</div>
          ) : usersError ? (
            <div className="role-control__message role-control__message--error">{usersError}</div>
          ) : users.length === 0 ? (
            <div className="role-control__users-empty">No hay usuarios registrados.</div>
          ) : (
            <div className="role-control__table-wrapper">
              <table className="role-control__table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Usuario</th>
                    <th>Tipo</th>
                    <th>Tema</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((userItem) => {
                    const isCurrentUser = userItem.id === currentUser?.id;
                    return (
                      <tr key={userItem.id}>
                        <td>{userItem.name || userItem.username}</td>
                        <td>{userItem.username}</td>
                        <td>
                          <span
                            className={`role-control__badge role-control__badge--${
                              userItem.role === 'admin' ? 'admin' : 'user'
                            }`}
                          >
                            {userItem.role === 'admin' ? 'Administrador' : 'Usuario'}
                          </span>
                        </td>
                        <td>{userItem.theme === 'dark' ? 'Oscuro' : 'Claro'}</td>
                        <td className="role-control__table-actions">
                          <button
                            type="button"
                            className="role-control__button role-control__button--small"
                            onClick={() => openEditUserForm(userItem)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="role-control__button role-control__button--danger role-control__button--small"
                            onClick={() => handleDeleteUser(userItem)}
                            disabled={isCurrentUser}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
