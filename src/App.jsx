import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import LoaderDashboard from './components/LoaderDashboard';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const GhausiaCollection = lazy(() => import('./pages/GhausiaCollection'));
const PartyLedger = lazy(() => import('./pages/PartyLedger'));
const Parties = lazy(() => import('./pages/Parties'));
const Payments = lazy(() => import('./pages/Payments'));
const RateCalculations = lazy(() => import('./pages/RateCalculations'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const UserApprovals = lazy(() => import('./pages/UserApprovals'));
const SuperAdminApprovals = lazy(() => import('./pages/SuperAdminApprovals'));
const ReviewLots = lazy(() => import('./pages/ReviewLots'));
const PersonalKhata = lazy(() => import('./pages/PersonalKhata'));
const PersonalKhataAccount = lazy(() => import('./pages/PersonalKhataAccount'));
const PersonalKhataShared = lazy(() => import('./pages/PersonalKhataShared'));
const UpgradeAccount = lazy(() => import('./pages/UpgradeAccount'));

function PersonalKhataAccessibleRoute({ sidebarOpen, setSidebarOpen }) {
  const { isAuthenticated } = useAuth();
  const body = <PersonalKhata standalone={!isAuthenticated} />;
  return isAuthenticated ? (
    <Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
      {body}
    </Layout>
  ) : (
    <div className="pk-standalone-shell">{body}</div>
  );
}

function Layout({ children, sidebarOpen, setSidebarOpen }) {
  const location = useLocation();

  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      setSidebarOpen(false);
    }
  }, [location.pathname, setSidebarOpen]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen && window.matchMedia('(max-width: 768px)').matches
      ? 'hidden'
      : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className={`app-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div
        className="app-sidebar-overlay"
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      <button
        type="button"
        className="app-menu-btn"
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          {sidebarOpen ? (
            <path d="M6 18L18 6M6 6l12 12" />
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      <main className="app-main">
        <div className="app-main-inner">
          <Suspense
            fallback={(
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <LoaderDashboard height={30} width={30} />
              </div>
            )}
          >
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function RequireAuth({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, isSuperAdmin, isPersonalKhata } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isPersonalKhata) {
    return <Navigate to="/personal-khata" replace />;
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

/** On each page navigation, refresh app data in the background so pages show the latest
 *  server state without a manual full-page reload. The first render is skipped (initial
 *  bootstrap already loads the data). refreshData is throttled + role-guarded internally. */
function RouteChangeRefresher() {
  const { pathname } = useLocation();
  const { refreshData, loadLedgerReceipts } = useApp();
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    refreshData();
    if (pathname === '/party-ledger' || pathname === '/review-lots') {
      void loadLedgerReceipts({ force: true });
    }
  }, [pathname, refreshData, loadLedgerReceipts]);

  return null;
}

/** Subtle, non-blocking indicator shown while a background data refresh is in flight. */
function BootstrapErrorBanner() {
  const { bootstrapLoadError, refreshData, initialDataLoading } = useApp();
  if (!bootstrapLoadError || initialDataLoading) return null;
  return (
    <div
      role="alert"
      className="bootstrap-error-banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 500,
        background: '#7f1d1d',
        color: '#fff',
        padding: '10px 16px',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <span>Could not load app data. Check your connection.</span>
      <button
        type="button"
        onClick={() => refreshData({ force: true })}
        style={{
          background: '#fff',
          color: '#7f1d1d',
          border: 'none',
          borderRadius: 6,
          padding: '4px 12px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function BackgroundRefreshIndicator() {
  const { backgroundRefreshing } = useApp();
  if (!backgroundRefreshing) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 400,
        background: '#1e293b',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        padding: '6px 14px',
        borderRadius: 999,
        boxShadow: '0 6px 20px rgba(15,23,42,0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: '#38bdf8', display: 'inline-block' }} />
      Updating…
    </div>
  );
}

function AppRoutes() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SuperAdminShell>
    <RouteChangeRefresher />
    <BootstrapErrorBanner />
    <BackgroundRefreshIndicator />
    <Suspense
      fallback={(
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <LoaderDashboard height={30} width={30} />
        </div>
      )}
    >
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/personal-khata/account" element={<PersonalKhataAccount />} />
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
      <Route path="/personal-khata/upgrade" element={<UpgradeAccount />} />
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
    </Suspense>
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
