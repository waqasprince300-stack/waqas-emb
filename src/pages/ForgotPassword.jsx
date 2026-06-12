import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import PasswordField from '../components/PasswordField';
import OtpVerify from '../components/OtpVerify';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../utils/formatApiError';
import {
  identifiersForPersonalKhataSignup,
  validatePersonalKhataIdentifier,
} from '../utils/personalKhataAccount';

const brandLogoSrc = `${process.env.PUBLIC_URL || ''}/seam-grace-logo.png`;

const destForRole = (role) =>
  role === 'super_admin'
    ? '/super-admin/pending-admins'
    : role === 'personal_khata'
      ? '/personal-khata'
      : '/';

export default function ForgotPassword() {
  const { requestPasswordReset, verifyPasswordReset } = useAuth();
  const navigate = useNavigate();

  const [idMethod, setIdMethod] = useState('email');
  const [form, setForm] = useState({ email: '', phone: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [stage, setStage] = useState('request');
  const [otp, setOtp] = useState(null);
  const [pw, setPw] = useState({ password: '', confirmPassword: '' });
  const [otpError, setOtpError] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  const buildIdentifier = () =>
    identifiersForPersonalKhataSignup(idMethod, form.email, form.phone);

  const handleRequest = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const idErr = validatePersonalKhataIdentifier(idMethod, form.email, form.phone);
    if (idErr) {
      setError(idErr);
      return;
    }
    setIsSubmitting(true);
    try {
      const { email, phone } = buildIdentifier();
      const res = await requestPasswordReset({ email, phone });
      const payload = res?.data || res || {};
      if (payload.otpId) {
        setOtp(payload);
        setStage('verify');
        setOtpError('');
      } else {
        setMessage(payload.message || 'If that account is registered, a verification code has been sent.');
      }
    } catch (err) {
      setError(formatApiError(err, 'Unable to send a reset code'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (code) => {
    setOtpError('');
    if (pw.password.length < 8) {
      setOtpError('Password must be at least 8 characters.');
      return;
    }
    if (pw.password !== pw.confirmPassword) {
      setOtpError('Passwords do not match.');
      return;
    }
    setOtpSubmitting(true);
    try {
      const res = await verifyPasswordReset({ otpId: otp.otpId, code, password: pw.password });
      if (res?.loggedIn) {
        navigate(destForRole(res?.user?.role), { replace: true });
        return;
      }
      navigate('/login', {
        replace: true,
        state: { message: res?.message || 'Password updated. You can sign in now.' },
      });
    } catch (err) {
      setOtpError(formatApiError(err, 'Unable to reset password'));
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleResend = async (channel) => {
    const { email, phone } = buildIdentifier();
    const res = await requestPasswordReset({ email, phone, channel });
    const payload = res?.data || res || {};
    if (payload.otpId) setOtp((prev) => ({ ...prev, ...payload }));
    return payload;
  };

  return (
    <AuthCard
      brandLogoSrc={brandLogoSrc}
      brandKicker="Embroidery workspace"
      title={stage === 'verify' ? 'Set a new password' : 'Recover password'}
      subtitle={
        stage === 'verify'
          ? 'Enter the code we sent and choose a new password.'
          : 'Get a verification code on your email or phone to reset your password.'
      }
      sideTitle="Reset access without losing your work history."
      sideText="Password recovery uses a short-lived one-time code so accounts can be restored safely."
      footer={<>Remembered your password? <Link className="auth-inline-link" to="/login">Login</Link></>}
    >
      {stage === 'verify' ? (
        <OtpVerify
          title="Enter your reset code"
          destinationMasked={otp?.destinationMasked}
          channel={otp?.channel}
          channels={otp?.channels}
          devCode={otp?.devCode}
          deliveryNote={otp?.deliveryNote}
          error={otpError}
          submitting={otpSubmitting}
          submitLabel="Reset password"
          onSubmit={handleVerify}
          onResend={handleResend}
          onBack={() => { setStage('request'); setOtpError(''); }}
          extraFields={(
            <>
              <label className="auth-label">
                <span className="auth-label-text">New password</span>
                <PasswordField
                  name="password"
                  placeholder="Minimum 8 characters"
                  value={pw.password}
                  onChange={(e) => setPw((p) => ({ ...p, password: e.target.value }))}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="auth-label">
                <span className="auth-label-text">Confirm password</span>
                <PasswordField
                  name="confirmPassword"
                  placeholder="Repeat password"
                  value={pw.confirmPassword}
                  onChange={(e) => setPw((p) => ({ ...p, confirmPassword: e.target.value }))}
                  required
                  autoComplete="new-password"
                />
              </label>
            </>
          )}
        />
      ) : (
        <form className="auth-form" onSubmit={handleRequest}>
          {error && <div className="alert alert-warning">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', alignSelf: 'center' }}>
              Send code to
            </span>
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

          {idMethod === 'email' ? (
            <label className="auth-label">
              <span className="auth-label-text">Email</span>
              <input
                className="form-input"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
                required
                autoFocus
                autoComplete="tel"
              />
            </label>
          )}

          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
            {isSubmitting ? 'Sending...' : 'Send verification code'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
