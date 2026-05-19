import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import PasswordField from '../components/PasswordField';
import { useAuth, normalizeAuthResponse } from '../context/AuthContext';
import { formatApiError } from '../utils/formatApiError';
import {
  identifiersForPersonalKhataSignup,
  validatePersonalKhataIdentifier,
} from '../utils/personalKhataAccount';

const brandLogoSrc = `${process.env.PUBLIC_URL || ''}/seam-grace-logo.png`;

export default function PersonalKhataAccount() {
  const { isAuthenticated, user, login, signup, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [idMethod, setIdMethod] = useState('email');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    const prev = document.title;
    document.title = 'Personal Khata account · Seam & Grace Embroidery';
    return () => {
      document.title = prev;
    };
  }, []);

  if (isAuthenticated) {
    const to =
      user?.role === 'super_admin'
        ? '/super-admin/pending-admins'
        : user?.role === 'personal_khata'
          ? '/personal-khata'
          : '/';
    return <Navigate to={to} replace />;
  }

  const runSignIn = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const idErr = validatePersonalKhataIdentifier(idMethod, form.email, form.phone);
    if (idErr) {
      setError(idErr);
      return;
    }
    if (!form.password) {
      setError('Password is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { email, phone } = identifiersForPersonalKhataSignup(idMethod, form.email, form.phone);
      await login({ email, phone, password: form.password });
      navigate('/personal-khata', { replace: true });
    } catch (err) {
      setError(formatApiError(err, 'Unable to sign in'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const runRegister = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!String(form.name || '').trim()) {
      setError('Enter your name.');
      return;
    }
    const idErr = validatePersonalKhataIdentifier(idMethod, form.email, form.phone);
    if (idErr) {
      setError(idErr);
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { email, phone } = identifiersForPersonalKhataSignup(idMethod, form.email, form.phone);
      const raw = await signup({
        name: form.name.trim(),
        email,
        phone,
        password: form.password,
        role: 'personal_khata',
      });
      const payload = raw?.data || raw || {};
      const token = payload.token || payload.accessToken;

      if (token) {
        refreshSession(normalizeAuthResponse(raw));
        navigate('/personal-khata', { replace: true });
        return;
      }

      const u = payload.user;
      const baseMsg = payload.message;
      if (u?.status === 'pending') {
        setMessage(
          baseMsg
            || 'Account created. You can sign in once it is approved — if your administrator enabled instant access for Personal Khata, try signing in now.',
        );
      } else {
        setMessage(baseMsg || 'Account created. You can sign in.');
      }
      setForm((f) => ({
        ...f,
        password: '',
        confirmPassword: '',
      }));
    } catch (err) {
      setError(formatApiError(err, 'Unable to create account'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      brandLogoSrc={brandLogoSrc}
      brandKicker="Personal Khata"
      sideTitle="Apna khata email ya mobile se save karein."
      sideText="Yeh alag hai business workspace login se — yahan sirf aapka personal ledger hai. Account banane ke baad yeh data aap ke naam par save hota hai."
      title={mode === 'signin' ? 'Personal Khata — sign in' : 'Personal Khata — register'}
      subtitle={
        mode === 'signin'
          ? 'Email ya phone number aur password se apna khata kholen.'
          : 'Naam, email ya phone, aur password — phir apna khata kisi bhi browser me sign in kar ke manage karen.'
      }
      footer={(
        <>
          <button
            type="button"
            className="auth-inline-link"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
            onClick={() => {
              setMode(mode === 'signin' ? 'register' : 'signin');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'signin' ? 'Naya account banayen' : 'Pehle se account hai? Sign in'}
          </button>
          <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>
          <Link className="auth-inline-link" to="/login">
            Business login
          </Link>
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', alignSelf: 'center' }}>Sign in with</span>
        <button
          type="button"
          className={idMethod === 'email' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          onClick={() => { setIdMethod('email'); setError(''); }}
        >
          Email
        </button>
        <button
          type="button"
          className={idMethod === 'phone' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          onClick={() => { setIdMethod('phone'); setError(''); }}
        >
          Phone
        </button>
      </div>

      <form className="auth-form" onSubmit={mode === 'signin' ? runSignIn : runRegister}>
        {message && (
          <div className="alert alert-success">
            {message}
          </div>
        )}
        {error && (
          <div className="alert alert-warning">
            {error}
          </div>
        )}

        {mode === 'register' && (
          <label className="auth-label">
            <span className="auth-label-text">Full name</span>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Aap ka naam"
              autoComplete="name"
            />
          </label>
        )}

        {idMethod === 'email' ? (
          <label className="auth-label">
            <span className="auth-label-text">Email</span>
            <input
              className="form-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
            />
          </label>
        ) : (
          <label className="auth-label">
            <span className="auth-label-text">Mobile number</span>
            <input
              className="form-input"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. 03001234567 or +923001234567"
              autoComplete="tel"
              autoFocus
            />
          </label>
        )}

        <label className="auth-label">
          <span className="auth-label-text">Password</span>
          <PasswordField
            name="password"
            placeholder={mode === 'register' ? 'At least 8 characters' : 'Password'}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>

        {mode === 'register' && (
          <label className="auth-label">
            <span className="auth-label-text">Confirm password</span>
            <PasswordField
              name="confirmPassword"
              placeholder="Repeat password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              required
              autoComplete="new-password"
            />
          </label>
        )}

        {mode === 'signin' && idMethod === 'email' && (
          <p style={{ margin: '-4px 0 8px', fontSize: 12.5 }}>
            <Link className="auth-inline-link" to="/forgot-password">
              Forgot password?
            </Link>
          </p>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={isSubmitting}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {isSubmitting ? 'Please wait…' : mode === 'signin' ? 'Sign in to Personal Khata' : 'Create Personal Khata account'}
        </button>
      </form>

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
        <strong>Note:</strong> Server must support role <code style={{ fontSize: 11 }}>personal_khata</code>, optional field{' '}
        <code style={{ fontSize: 11 }}>phone</code>, and login with either <code style={{ fontSize: 11 }}>email</code> or{' '}
        <code style={{ fontSize: 11 }}>phone</code>. See README for API details.
      </p>
    </AuthCard>
  );
}
