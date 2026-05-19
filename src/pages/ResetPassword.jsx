import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { useAuth, normalizeAuthResponse } from '../context/AuthContext';
import { formatApiError } from '../utils/formatApiError';

const brandLogoSrc = `${process.env.PUBLIC_URL || ''}/seam-grace-logo.png`;

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { resetPassword, refreshSession } = useAuth();
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

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
      const raw = await resetPassword(token, { password: form.password });
      const payload = raw?.data || raw || {};
      if (payload.token && payload.user) {
        refreshSession(normalizeAuthResponse(raw));
        const dest =
          payload.user?.role === 'super_admin'
            ? '/super-admin/pending-admins'
            : payload.user?.role === 'personal_khata'
              ? '/personal-khata'
              : '/';
        navigate(dest, { replace: true });
        return;
      }
      navigate('/login', {
        replace: true,
        state: { message: payload.message || 'Password updated. You can sign in when your account is approved.' },
      });
    } catch (err) {
      setError(formatApiError(err, 'Unable to reset password'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      brandLogoSrc={brandLogoSrc}
      brandKicker="Embroidery workspace"
      title="Set new password"
      subtitle="Choose a fresh password with at least 8 characters."
      sideTitle="Secure your account and get back to production tracking."
      sideText="After reset, use your new password to sign in and continue from where you left off."
      footer={<>Back to <Link className="auth-inline-link" to="/login">login</Link></>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-warning">
            {error}
          </div>
        )}

        <label className="auth-label">
          <span className="auth-label-text">New Password</span>
          <input
            className="form-input"
            type="password"
            placeholder="Minimum 8 characters"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            minLength={8}
            required
            autoFocus
          />
        </label>

        <label className="auth-label">
          <span className="auth-label-text">Confirm Password</span>
          <input
            className="form-input"
            type="password"
            placeholder="Repeat password"
            value={form.confirmPassword}
            onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            minLength={8}
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
          {isSubmitting ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </AuthCard>
  );
}
