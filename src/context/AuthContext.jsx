import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import apiService, { registerSessionExpiredHandler } from '../services/api';
import { getDeviceId, getDeviceLabel } from '../utils/deviceId';

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
  const rawRole = user?.role;
  const role = ['super_admin', 'admin', 'party', 'personal_khata'].includes(rawRole)
    ? rawRole
    : 'party';
  const id = String(user?._id ?? user?.id ?? '').trim();
  return {
    token,
    user: {
      ...user,
      id: id || user?.id,
      _id: user?._id ?? id,
      role,
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
    if (u && u.status === 'approved' && u.role !== 'admin' && u.role !== 'super_admin') {
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
    if (!u || u.status !== 'approved' || u.role === 'admin' || u.role === 'super_admin') return;
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

  const signup = useCallback(async ({
    name,
    email,
    phone,
    password,
    role,
    partyId,
    partyName,
    adminEmail,
  }) => {
    return apiService.signup({
      name: String(name || '').trim(),
      email: email != null ? normalizeEmail(email) : '',
      phone: phone != null ? String(phone || '').trim() : '',
      password,
      role,
      partyId,
      partyName,
      adminEmail,
      deviceId: getDeviceId(),
      deviceLabel: getDeviceLabel(),
    });
  }, []);

  /**
   * `email` and/or `phone` — backend accepts one of them.
   * Returns `{ otpRequired: true, otpId, channel, ... }` when a new device must be verified,
   * otherwise `{ otpRequired: false, user }` after the session is saved.
   */
  const login = useCallback(async ({ email, phone, password, otpChannel }) => {
    const phoneTrim = phone != null ? String(phone || '').trim() : '';
    const body = {
      password,
      deviceId: getDeviceId(),
      deviceLabel: getDeviceLabel(),
      ...(otpChannel ? { otpChannel } : {}),
      ...(phoneTrim ? { phone: phoneTrim } : { email: normalizeEmail(email) }),
    };
    const response = await apiService.login(body);
    const payload = response?.data || response || {};
    if (payload.otpRequired) {
      return { otpRequired: true, ...payload };
    }
    const user = saveSession(normalizeAuthResponse(response));
    return { otpRequired: false, user };
  }, [saveSession]);

  /** Verify the new-device login code and save the session. Returns the signed-in user. */
  const verifyLoginOtp = useCallback(async ({ otpId, code }) => {
    const response = await apiService.verifyLoginOtp({
      otpId,
      code: String(code || '').trim(),
      deviceId: getDeviceId(),
      deviceLabel: getDeviceLabel(),
    });
    return saveSession(normalizeAuthResponse(response));
  }, [saveSession]);

  const resendLoginOtp = useCallback(({ otpId, channel }) => {
    return apiService.resendLoginOtp({ otpId, ...(channel ? { channel } : {}) });
  }, []);

  /** OTP password reset — step 1. `email` or `phone`, optional `channel`. */
  const requestPasswordReset = useCallback(({ email, phone, channel }) => {
    const phoneTrim = phone != null ? String(phone || '').trim() : '';
    return apiService.requestPasswordResetOtp({
      ...(channel ? { channel } : {}),
      ...(phoneTrim ? { phone: phoneTrim } : { email: normalizeEmail(email) }),
    });
  }, []);

  /** OTP password reset — step 2. Auto-signs in when the account is approved. */
  const verifyPasswordReset = useCallback(async ({ otpId, code, password }) => {
    const response = await apiService.verifyPasswordResetOtp({
      otpId,
      code: String(code || '').trim(),
      password,
      deviceId: getDeviceId(),
    });
    const payload = response?.data || response || {};
    if (payload.token && payload.user) {
      saveSession(normalizeAuthResponse(response));
      return { ...payload, loggedIn: true };
    }
    return { ...payload, loggedIn: false };
  }, [saveSession]);

  /** Upgrade the current Personal Khata account to admin/party. Auto-signs in when approved. */
  const upgradeAccount = useCallback(async (data) => {
    const response = await apiService.upgradeAccount(data);
    const payload = response?.data || response || {};
    if (payload.token && payload.user) {
      saveSession(normalizeAuthResponse(response));
      return { ...payload, loggedIn: true };
    }
    return { ...payload, loggedIn: false };
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
    isSuperAdmin: user?.role === 'super_admin',
    isParty: user?.role === 'party',
    isPersonalKhata: user?.role === 'personal_khata',
    signup,
    login,
    verifyLoginOtp,
    resendLoginOtp,
    requestPasswordReset,
    verifyPasswordReset,
    upgradeAccount,
    forgotPassword,
    resetPassword,
    logout,
    refreshSession: saveSession,
  }), [
    forgotPassword,
    login,
    verifyLoginOtp,
    resendLoginOtp,
    requestPasswordReset,
    verifyPasswordReset,
    upgradeAccount,
    logout,
    resetPassword,
    saveSession,
    signup,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
