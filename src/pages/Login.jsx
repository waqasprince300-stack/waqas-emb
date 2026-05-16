import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { useAuth } from '../context/AuthContext';
import { getRegistrationEmailError } from '../utils/registrationEmail';
import { formatApiError } from '../utils/formatApiError';

export default function Login() {
  const { isAuthenticated, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const resetNotice = location.state?.message;
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    const to = user?.role === 'super_admin' ? '/super-admin/pending-admins' : '/';
    return <Navigate to={to} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const emailErr = getRegistrationEmailError(form.email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setIsSubmitting(true);
    try {
      const userAfter = await login(form);
      if (userAfter?.role === 'super_admin') {
        navigate('/super-admin/pending-admins', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(formatApiError(err, 'Unable to login'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue managing lots, ledgers, and payments."
      footer={
        <>
          Need an account? <Link className="auth-inline-link" to="/signup">Create one</Link>
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <Link className="auth-inline-link" to="/personal-khata">
              Personal Khata · bina login kholein →
            </Link>
          </div>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {resetNotice && (
          <div className="alert alert-success">
            {resetNotice}
          </div>
        )}
        {error && (
          <div className="alert alert-warning">
            {error}
          </div>
        )}

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

        <label className="auth-label">
          <span className="auth-label-row">
            <span style={{ color: 'var(--text-secondary)' }}>Password</span>
            <Link className="auth-inline-link" to="/forgot-password">Forgot password?</Link>
          </span>
          <input
            className="form-input"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
          {isSubmitting ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </AuthCard>
  );
}
