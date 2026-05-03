import React, { createContext, useContext, useMemo, useState } from 'react';

const AuthContext = createContext(null);
const USERS_KEY = 'waqas_emb_auth_users';
const SESSION_KEY = 'waqas_emb_auth_session';

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const readStoredUsers = () => safeJsonParse(localStorage.getItem(USERS_KEY), []);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => safeJsonParse(localStorage.getItem(SESSION_KEY), null));

  const signup = ({ name, email, password, role, partyId, partyName }) => {
    const users = readStoredUsers();
    const nextUser = {
      id: `${Date.now()}`,
      name: String(name || '').trim(),
      email: normalizeEmail(email),
      password: String(password || ''),
      role: role === 'party' ? 'party' : 'admin',
      partyId: role === 'party' ? String(partyId || '') : '',
      partyName: role === 'party' ? String(partyName || '').trim() : '',
    };

    const existingIndex = users.findIndex((stored) => normalizeEmail(stored.email) === nextUser.email);
    const nextUsers = existingIndex >= 0
      ? users.map((stored, index) => (index === existingIndex ? nextUser : stored))
      : [...users, nextUser];

    localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
    const sessionUser = { ...nextUser, password: undefined };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
    return sessionUser;
  };

  const login = ({ email, password }) => {
    const emailKey = normalizeEmail(email);
    const match = readStoredUsers().find(
      (stored) => normalizeEmail(stored.email) === emailKey && String(stored.password || '') === String(password || ''),
    );
    if (!match) {
      throw new Error('Invalid email or password');
    }
    const sessionUser = { ...match, password: undefined };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
    return sessionUser;
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isParty: user?.role === 'party',
    signup,
    login,
    logout,
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
