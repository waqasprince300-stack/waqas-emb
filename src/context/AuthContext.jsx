import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import apiService, { registerSessionExpiredHandler } from '../services/api';

const AuthContext = createContext(null);
const SESSION_KEY = 'waqas_emb_auth_session';
const BUSINESS_OWNER_STORAGE_KEY = 'waqas_emb_business_owner_id';
const WORKSPACE_VIEW_ALL_STORAGE_KEY = 'waqas_emb_workspace_view_all';

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const normalizeAuthResponse = (response) => {
  const payload = response?.data || response || {};
  const user = payload.user || payload;
  const token = payload.token || payload.accessToken || response?.token || response?.accessToken || '';
  return {
    token,
    user: {
      ...user,
      role: user?.role ?? 'party',
      status: user?.status ?? 'approved',
      email: normalizeEmail(user?.email),
    },
  };
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const stored = safeJsonParse(localStorage.getItem(SESSION_KEY), null);
    if (!stored) return null;
    return normalizeAuthResponse(stored.user ? stored : { user: stored, token: stored.token || '' });
  });

  const saveSession = useCallback((nextSession) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    const u = nextSession?.user;
    if (u && u.status === 'approved' && u.role !== 'admin') {
      try {
        localStorage.removeItem(BUSINESS_OWNER_STORAGE_KEY);
        localStorage.removeItem(WORKSPACE_VIEW_ALL_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    return nextSession.user;
  }, []);

  useEffect(() => {
    const u = session?.user;
    if (!u || u.status !== 'approved' || u.role === 'admin') return;
    try {
      localStorage.removeItem(BUSINESS_OWNER_STORAGE_KEY);
      localStorage.removeItem(WORKSPACE_VIEW_ALL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [session?.user?.role, session?.user?.status, session?.user?._id]);

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
      try {
        localStorage.removeItem(BUSINESS_OWNER_STORAGE_KEY);
        localStorage.removeItem(WORKSPACE_VIEW_ALL_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      const pathname = window.location.pathname;
      /** Allow anon tools (personal khata) without forcing login redirect */
      const allowNoRedirect =
        pathname.startsWith('/login') ||
        pathname.startsWith('/signup') ||
        pathname.startsWith('/forgot-password') ||
        pathname.startsWith('/reset-password') ||
        pathname.startsWith('/personal-khata');
      const loginPath = `${window.location.origin}/login`;
      if (!allowNoRedirect) {
        window.location.assign(loginPath);
      }
    });
    return () => registerSessionExpiredHandler(null);
  }, []);

  const signup = useCallback(async ({ name, email, password, role, partyId, partyName, adminEmail }) => {
    return apiService.signup({
      name: String(name || '').trim(),
      email: normalizeEmail(email),
      password,
      role,
      partyId,
      partyName,
      adminEmail,
    });
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const response = await apiService.login({
      email: normalizeEmail(email),
      password,
    });
    return saveSession(normalizeAuthResponse(response));
  }, [saveSession]);

  const forgotPassword = useCallback(({ email }) => {
    return apiService.forgotPassword({ email: normalizeEmail(email) });
  }, []);

  const resetPassword = useCallback((token, { password }) => {
    return apiService.resetPassword(token, { password });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    try {
      localStorage.removeItem(BUSINESS_OWNER_STORAGE_KEY);
      localStorage.removeItem(WORKSPACE_VIEW_ALL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
  }, []);

  const user = session?.user || null;

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user && user?.status === 'approved',
    /** Tenant (business) administrator — owns businesses, parties, operational data */
    isAdmin: user?.role === 'admin',
    isTenantAdmin: user?.role === 'admin',
    isParty: user?.role === 'party',
    signup,
    login,
    forgotPassword,
    resetPassword,
    logout,
    refreshSession: saveSession,
  }), [forgotPassword, login, logout, resetPassword, saveSession, signup, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
