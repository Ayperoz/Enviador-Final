import { NavLink } from 'react-router-dom';
import {
  Squares2X2Icon,
  ChartBarIcon,
  Cog6ToothIcon,
  InboxIcon,
  PresentationChartBarIcon,
  QuestionMarkCircleIcon,
  AdjustmentsHorizontalIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import logoNegro from '../assets/logo.png';
import { useAuth } from '../context/AuthContext.jsx';
import './Sidebar.css';

export default function Sidebar() {
  const { user, settings } = useAuth();

  const menuItems = [
    { to: '/canales', label: 'Canales', icon: Squares2X2Icon },
    { to: '/campanas', label: 'Campañas', icon: InboxIcon },
    { to: '/datos', label: 'Datos', icon: Cog6ToothIcon },
    { to: '/monitor', label: 'Monitor', icon: ChartBarIcon },
    { to: '/reportes', label: 'Reportes', icon: PresentationChartBarIcon }
  ];

  if (settings?.normalizerEnabled) {
    menuItems.push({ to: '/normalizador', label: 'Normalizador', icon: AdjustmentsHorizontalIcon });
  }

  menuItems.push({ to: '/faq', label: 'FAQ', icon: QuestionMarkCircleIcon });

  if (user?.role === 'admin') {
    menuItems.push({ to: '/configuracion', label: 'Configuración', icon: ShieldCheckIcon });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
         <img className="sidebar__logo" src={logoNegro} alt="Alt64 - Enviador" />
      </div>
      <nav className="sidebar__nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
          >
            <item.icon className="sidebar__icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
