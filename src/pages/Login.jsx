import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to login');
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
            placeholder="you@example.com"
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
