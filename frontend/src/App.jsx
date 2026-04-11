import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, Settings, Cpu, LogOut, BarChart3, Search, Users, UserCircle } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import MachineDetail from './pages/MachineDetail';
import Analysis from './pages/Analysis';
import Trace from './pages/Trace';
import SettingsPage from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';
import UserManagement from './pages/UserManagement';
import { AuthProvider, useAuth } from './context/AuthContext';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)', color: 'white' }}>
      <div style={{ textAlign: 'center' }}>
        <Cpu className="animate-pulse" size={48} color="var(--primary)" />
        <p style={{ marginTop: '1rem', opacity: 0.6 }}>Đang xác thực...</p>
      </div>
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
};

const Sidebar = ({ user, logout }) => (
  <aside className="sidebar">
    <div className="logo-area">
      <Cpu color="#3b82f6" size={32} />
      <h2>X-RAY VISION</h2>
    </div>

    <div className="user-profile">
      <div className="user-avatar">{user?.full_name?.charAt(0) || 'U'}</div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user?.full_name}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{user?.role}</div>
      </div>
    </div>

    <nav className="nav-links">
      {(user?.role === 'ADMIN' || user?.permissions?.includes('CAN_VIEW_DASHBOARD')) && (
        <div className="nav-item">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>
        </div>
      )}
      {(user?.role === 'ADMIN' || user?.permissions?.includes('CAN_VIEW_REPORTS')) && (
        <>
          <div className="nav-item">
            <NavLink to="/analysis" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <BarChart3 size={20} />
              <span>Phân tích</span>
            </NavLink>
          </div>
          <div className="nav-item">
            <NavLink to="/trace" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Search size={20} />
              <span>Truy vết</span>
            </NavLink>
          </div>
        </>
      )}
      {(user?.role === 'ADMIN' || user?.permissions?.includes('CAN_MANAGE_USERS')) && (
        <div className="nav-item">
          <NavLink to="/admin/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Users size={20} />
            <span>Nhân sự</span>
          </NavLink>
        </div>
      )}
      {(user?.role === 'ADMIN' || user?.permissions?.includes('CAN_MANAGE_SYSTEM')) && (
        <div className="nav-item">
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={20} />
            <span>Cấu hình</span>
          </NavLink>
        </div>
      )}
    </nav>

    <div style={{ marginTop: 'auto' }}>
      <button onClick={logout} className="nav-link" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}>
        <LogOut size={18} />
        <span>Đăng xuất</span>
      </button>
    </div>
  </aside>
);

const AuthenticatedLayout = ({ children }) => {
  const { user, logout } = useAuth();
  return (
    <div className="app-container">
      <Sidebar user={user} logout={logout} />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)', color: 'white' }}>
        <div style={{ textAlign: 'center' }}>
          <Cpu className="animate-pulse" size={48} color="var(--primary)" />
          <p style={{ marginTop: '1rem', opacity: 0.6 }}>Đang khởi tạo hệ thống...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={<PrivateRoute><AuthenticatedLayout><Dashboard /></AuthenticatedLayout></PrivateRoute>}
      />
      <Route
        path="/machine/:id"
        element={<PrivateRoute><AuthenticatedLayout><MachineDetail /></AuthenticatedLayout></PrivateRoute>}
      />
      <Route
        path="/analysis"
        element={<PrivateRoute><AuthenticatedLayout><Analysis /></AuthenticatedLayout></PrivateRoute>}
      />
      <Route
        path="/trace"
        element={<PrivateRoute><AuthenticatedLayout><Trace /></AuthenticatedLayout></PrivateRoute>}
      />
      <Route
        path="/admin/users"
        element={<PrivateRoute><AuthenticatedLayout><UserManagement /></AuthenticatedLayout></PrivateRoute>}
      />
      <Route
        path="/settings"
        element={<PrivateRoute><AuthenticatedLayout><SettingsPage /></AuthenticatedLayout></PrivateRoute>}
      />

      {/* Root/Default Redirects */}
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
