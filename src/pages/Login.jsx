import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import PasswordField from '../components/PasswordField';
import OtpVerify from '../components/OtpVerify';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../utils/formatApiError';
import {
  identifiersForPersonalKhataSignup,
  validatePersonalKhataIdentifier,
} from '../utils/personalKhataAccount';

const destForRole = (role) =>
  role === 'super_admin'
    ? '/super-admin/pending-admins'
    : role === 'personal_khata'
      ? '/personal-khata'
      : '/';

export default function Login() {
  const { isAuthenticated, user, login, verifyLoginOtp, resendLoginOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const resetNotice = location.state?.message;

  const [idMethod, setIdMethod] = useState('email');
  const [form, setForm] = useState({ email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [stage, setStage] = useState('credentials');
  const [otp, setOtp] = useState(null);
  const [otpError, setOtpError] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated) return;
    const prev = document.title;
    document.title = 'Sign in · Seam & Grace Embroidery';
    return () => {
      document.title = prev;
    };
  }, [isAuthenticated]);

  if (isAuthenticated) {
    return <Navigate to={destForRole(user?.role)} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
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
      const result = await login({ email, phone, password: form.password });
      if (result?.otpRequired) {
        setOtp(result);
        setStage('otp');
        setOtpError('');
        return;
      }
      navigate(destForRole(result?.user?.role), { replace: true });
    } catch (err) {
      setError(formatApiError(err, 'Unable to login'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (code) => {
    setOtpError('');
    setOtpSubmitting(true);
    try {
      const signedIn = await verifyLoginOtp({ otpId: otp.otpId, code });
      navigate(destForRole(signedIn?.role), { replace: true });
    } catch (err) {
      setOtpError(formatApiError(err, 'Unable to verify code'));
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleResend = async (channel) => {
    const res = await resendLoginOtp({ otpId: otp.otpId, channel });
    const payload = res?.data || res || {};
    setOtp((prev) => ({ ...prev, ...payload }));
    return payload;
  };

  const focusPasswordField = () => {
    const el = document.getElementById('login-password');
    if (el) el.focus();
  };

  /** Email/phone field: Enter moves to the password box instead of submitting. */
  const handleIdentifierKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      focusPasswordField();
    }
  };

  const brandLogoSrc = `${process.env.PUBLIC_URL || ''}/seam-grace-logo.png`;

  return (
    <AuthCard
      brandLogoSrc={brandLogoSrc}
      brandKicker="Embroidery workspace"
      sideTitle="Stitch clarity into every job, ledger, and payment."
      sideText="A calm, modern cockpit for Seam & Grace—production, parties, and cash flow aligned."
      title={stage === 'otp' ? 'Verify it’s you' : 'Welcome back'}
      subtitle={
        stage === 'otp'
          ? 'New device detected — confirm the code to continue.'
          : 'Sign in to continue managing lots, ledgers, and payments.'
      }
      footer={
        <>
          Need an account?{' '}
          <Link className="auth-inline-link" to="/signup">
            Create one
          </Link>
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <Link
              className="auth-inline-link"
              to="/personal-khata/account"
              style={{ fontWeight: 600 }}
            >
              Personal Khata — register / sign in (email or phone)
            </Link>
          </div>
        </>
      }
    >
      {stage === 'otp' ? (
        <OtpVerify
          title="Enter your sign-in code"
          destinationMasked={otp?.destinationMasked}
          channel={otp?.channel}
          channels={otp?.channels}
          devCode={otp?.devCode}
          deliveryNote={otp?.deliveryNote}
          error={otpError}
          submitting={otpSubmitting}
          submitLabel="Verify & sign in"
          onSubmit={handleVerify}
          onResend={handleResend}
          onBack={() => {
            setStage('credentials');
            setOtpError('');
          }}
        />
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          {resetNotice && <div className="alert alert-success">{resetNotice}</div>}
          {error && <div className="alert alert-warning">{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                alignSelf: 'center',
              }}
            >
              Sign in with
            </span>
            <button
              type="button"
              className={idMethod === 'email' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => {
                setIdMethod('email');
                setError('');
              }}
            >
              Email
            </button>
            <button
              type="button"
              className={idMethod === 'phone' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => {
                setIdMethod('phone');
                setError('');
              }}
            >
              Phone
            </button>
          </div>

          {idMethod === 'email' ? (
            <label className="auth-label">
              <span className="auth-label-text">Email</span>
              <input
                className="form-input"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onKeyDown={handleIdentifierKeyDown}
                required
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
                placeholder="e.g. 03001234567 or +923001234567"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                onKeyDown={handleIdentifierKeyDown}
                required
                autoFocus
                autoComplete="tel"
              />
            </label>
          )}

          <label className="auth-label">
            <span className="auth-label-row">
              <span style={{ color: 'var(--text-secondary)' }}>Password</span>
              <Link className="auth-inline-link" to="/forgot-password" tabIndex={-1}>
                Forgot password?
              </Link>
            </span>
            <PasswordField
              id="login-password"
              name="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              autoComplete="current-password"
            />
          </label>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={isSubmitting}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
