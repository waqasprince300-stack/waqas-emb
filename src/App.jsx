import React, { useState } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import GhausiaCollection from './pages/GhausiaCollection';
import PartyLedger from './pages/PartyLedger';
import Parties from './pages/Parties';
import Payments from './pages/Payments';
import RateCalculations from './pages/RateCalculations';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import UserApprovals from './pages/UserApprovals';
import SuperAdminApprovals from './pages/SuperAdminApprovals';
import ReviewLots from './pages/ReviewLots';
import PersonalKhata from './pages/PersonalKhata';
import PersonalKhataShared from './pages/PersonalKhataShared';

function PersonalKhataAccessibleRoute({ sidebarOpen, setSidebarOpen }) {
  const { isAuthenticated } = useAuth();
  const body = <PersonalKhata standalone={!isAuthenticated} />;
  return isAuthenticated ? (
    <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
      {body}
    </Layout>
  ) : (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>{body}</div>
  );
}

function Layout({ children, sidebarOpen, setSidebarOpen }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 150,
            display: window.innerWidth <= 768 ? 'block' : 'none'
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 300,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 8,
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: window.innerWidth <= 768 ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {sidebarOpen ? (
            <path d="M6 18L18 6M6 6l12 12"/>
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </>
          )}
        </svg>
      </button>
      
      <main style={{ 
        marginLeft: window.innerWidth > 768 ? 230 : 0, 
        flex: 1, 
        padding: window.innerWidth <= 480 ? '16px 16px 40px' : window.innerWidth <= 768 ? '20px 20px 40px' : '28px 28px 40px', 
        minHeight: '100vh', 
        background: '#F0F2F5',
        paddingTop: window.innerWidth <= 768 ? 72 : undefined
      }}>
        {children}
      </main>
    </div>
  );
}

function RequireAuth({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, isSuperAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isSuperAdmin) {
    return <Navigate to="/super-admin/pending-admins" replace />;
  }

  return children;
}

function RequireSuperAdminAuth({ children }) {
  const { isAuthenticated, isSuperAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/** Super admins only use the approval console (and auth / personal khata pages). */
function SuperAdminShell({ children }) {
  const location = useLocation();
  const { user, isSuperAdmin } = useAuth();

  if (user?.status === 'approved' && isSuperAdmin) {
    const p = location.pathname;
    const allowed =
      p.startsWith('/super-admin') ||
      p.startsWith('/login') ||
      p.startsWith('/signup') ||
      p.startsWith('/forgot-password') ||
      p.startsWith('/reset-password') ||
      p.startsWith('/personal-khata');
    if (!allowed) {
      return <Navigate to="/super-admin/pending-admins" replace />;
    }
  }

  return children;
}

function AppRoutes() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SuperAdminShell>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route
        path="/"
        element={(
          <RequireAuth>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <Dashboard />
            </Layout>
          </RequireAuth>
        )}
      />
      <Route
        path="/ghausia"
        element={(
          <RequireAuth adminOnly>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <GhausiaCollection />
            </Layout>
          </RequireAuth>
        )}
      />
      <Route
        path="/party-ledger"
        element={(
          <RequireAuth>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <PartyLedger />
            </Layout>
          </RequireAuth>
        )}
      />
      <Route
        path="/parties"
        element={(
          <RequireAuth adminOnly>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <Parties />
            </Layout>
          </RequireAuth>
        )}
      />
      <Route
        path="/payments"
        element={(
          <RequireAuth>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <Payments />
            </Layout>
          </RequireAuth>
        )}
      />
      <Route
        path="/rate-calculations"
        element={(
          <RequireAuth>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <RateCalculations />
            </Layout>
          </RequireAuth>
        )}
      />
      <Route
        path="/users"
        element={(
          <RequireAuth adminOnly>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <UserApprovals />
            </Layout>
          </RequireAuth>
        )}
      />
      <Route
        path="/review-lots"
        element={(
          <RequireAuth adminOnly>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <ReviewLots />
            </Layout>
          </RequireAuth>
        )}
      />
      <Route
        path="/super-admin/pending-admins"
        element={(
          <RequireSuperAdminAuth>
            <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <SuperAdminApprovals />
            </Layout>
          </RequireSuperAdminAuth>
        )}
      />
      <Route path="/personal-khata/shared" element={<PersonalKhataShared />} />
      <Route
        path="/personal-khata"
        element={(
          <PersonalKhataAccessibleRoute sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        )}
      />
      <Route
        path="/personal-khata/contact/:contactId"
        element={(
          <PersonalKhataAccessibleRoute sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </SuperAdminShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
