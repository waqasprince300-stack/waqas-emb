import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  {
    to: '/super-admin/pending-admins',
    label: 'Verify administrators',
    superOnly: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    to: '/', label: 'Dashboard', exact: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    to: '/ghausia', label: 'Work Spaces',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
  },
  {
    to: '/party-ledger', label: 'Party Ledger',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    to: '/parties', label: 'Parties',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    to: '/personal-khata',
    label: 'Personal Khata',
    partyLabel: 'Personal Khata',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <line x1="8" y1="7" x2="16" y2="7" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
  {
    to: '/payments', label: 'Payments',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  {
    to: '/review-lots',
    label: 'Review Lots',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <path d="M12 13h4"/>
        <path d="M12 17h4"/>
        <circle cx="8" cy="15" r="2"/>
      </svg>
    ),
  },
  {
    to: '/rate-calculations',
    label: 'Rate Calculations',
    partyLabel: 'Rate Calculator',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
        <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
      </svg>
    ),
  },
  {
    to: '/users', label: 'Users / Approvals',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <polyline points="17 11 19 13 23 9"/>
      </svg>
    ),
  },
];

export default function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();
  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };
  const visibleNavItems = navItems.filter((item) => {
    if (isSuperAdmin) {
      if (item.superOnly) return true;
      return item.to === '/personal-khata';
    }
    if (item.superOnly) {
      return false;
    }
    if (isAdmin) {
      return true;
    }
    return ['/', '/party-ledger', '/payments', '/personal-khata', '/rate-calculations'].includes(item.to);
  });

  return (
    <aside style={{
      width: 230,
      minHeight: '100vh',
      background: '#1e1e2e',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 200,
      boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
      transform: window.innerWidth <= 768 ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
      transition: 'transform 0.3s ease',
    }}>
      {/* Mobile close button */}
      <div style={{ 
        display: window.innerWidth <= 768 ? 'flex' : 'none',
        justifyContent: 'flex-end',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)'
      }}>
        <button
          onClick={() => setSidebarOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: 20,
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4
          }}
        >
          ×
        </button>
      </div>

      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
          Ghausia
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Textile Manager
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '14px 10px', flex: 1 }}>
        {visibleNavItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            onClick={handleNavClick}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '10px 12px',
              borderRadius: 9,
              marginBottom: 3,
              textDecoration: 'none',
              fontSize: 13.5,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#fff' : '#94a3b8',
              background: isActive ? 'rgba(59,130,246,0.18)' : 'transparent',
              transition: 'all 0.15s',
              borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
            })}
          >
            <span style={{ opacity: 0.85 }}>{item.icon}</span>
            {!isAdmin && !isSuperAdmin && item.partyLabel ? item.partyLabel : item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: '#64748b' }}>
        {user && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>{user.name}</div>
            {user.email ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: '#94a3b8',
                  fontWeight: 500,
                  lineHeight: 1.35,
                  wordBreak: 'break-all',
                }}
                title={user.email}
              >
                {user.email}
              </div>
            ) : null}
            <div style={{ marginTop: 4, textTransform: 'capitalize' }}>
              {String(user.role || '').replace('_', ' ')}{user.partyName ? ` · ${user.partyName}` : ''}
            </div>
            <button
              type="button"
              onClick={logout}
              style={{
                marginTop: 10,
                width: '100%',
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Logout
            </button>
          </div>
        )}
        © 2025 Ghausia Collection
      </div>
    </aside>
  );
}
