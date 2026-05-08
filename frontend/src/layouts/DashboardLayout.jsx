import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import './DashboardLayout.css';

export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard__content">
        <Topbar />
        <main className="dashboard__main">{children}</main>
      </div>
    </div>
  );
}
