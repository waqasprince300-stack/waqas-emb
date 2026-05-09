import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import apiService from '../services/api';

const AuthContext = createContext(null);
const SESSION_KEY = 'waqas_emb_auth_session';

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeAuthResponse = (response) => {
  const payload = response?.data || response || {};
  const user = payload.user || payload;
  const token = payload.token || payload.accessToken || response?.token || response?.accessToken || '';
  return {
    token,
    user: {
      ...user,
      role: user?.role || 'admin',
      email: normalizeEmail(user?.email),
    },
  };
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const stored = safeJsonParse(localStorage.getItem(SESSION_KEY), null);
    if (!stored) return null;
    return stored.user ? stored : { user: stored, token: stored.token || '' };
  });

  const saveSession = useCallback((nextSession) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    return nextSession.user;
  }, []);

  const signup = useCallback(async ({ name, email, password, role, partyId, partyName }) => {
    const response = await apiService.signup({
      name: String(name || '').trim(),
      email: normalizeEmail(email),
      password,
      role,
      partyId,
      partyName,
    });
    return saveSession(normalizeAuthResponse(response));
  }, [saveSession]);

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
    setSession(null);
  }, []);

  const user = session?.user || null;

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isParty: user?.role === 'party',
    signup,
    login,
    forgotPassword,
    resetPassword,
    logout,
  }), [forgotPassword, login, logout, resetPassword, signup, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
