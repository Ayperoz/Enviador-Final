import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logoNegro from '../assets/logo-negro.png';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    setCredentials((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(credentials);
      navigate('/');
    } catch (err) {
      setError('Credenciales inválidas.');
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <img
          className="login__logo"
          src={logoNegro}
          alt="Alt64 - Enviador"
        />
        <p>Ingresa tus credenciales para continuar.</p>
        <form className="login__form" onSubmit={handleSubmit}>
          <label className="login__label" htmlFor="username">
            Usuario
          </label>
          <input
            id="username"
            name="username"
            value={credentials.username}
            onChange={handleChange}
            placeholder="usuario"
            autoFocus
            required
          />

          <label className="login__label" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={credentials.password}
            onChange={handleChange}
            placeholder="********"
            required
          />

          {error && <div className="login__error">{error}</div>}

          <button type="submit" className="login__button" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
