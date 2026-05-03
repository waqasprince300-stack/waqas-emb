import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
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
    to: '/ghausia', label: 'Ghausia Collection',
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
    to: '/payments', label: 'Payments',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  {
    to: '/rate-calculations', label: 'Rate Calculations',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
        <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
      </svg>
    ),
  },
];

export default function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const { user, isAdmin, logout } = useAuth();
  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };
  const visibleNavItems = navItems.filter((item) => (
    isAdmin || ['/', '/party-ledger', '/payments'].includes(item.to)
  ));

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
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: '#64748b' }}>
        {user && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>{user.name}</div>
            <div style={{ marginTop: 2, textTransform: 'capitalize' }}>
              {user.role}{user.partyName ? ` · ${user.partyName}` : ''}
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
