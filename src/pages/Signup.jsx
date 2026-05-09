import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { useAuth, normalizeAuthResponse } from '../context/AuthContext';
import { getRegistrationEmailError } from '../utils/registrationEmail';

export default function Signup() {
  const { isAuthenticated, signup, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'party',
    partyName: '',
    adminEmail: '',
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    const mainEmailErr = getRegistrationEmailError(form.email);
    if (mainEmailErr) {
      setError(mainEmailErr);
      return;
    }
    if (form.role === 'party') {
      const adminErr = getRegistrationEmailError(form.adminEmail);
      if (adminErr) {
        setError(`Business administrator: ${adminErr}`);
        return;
      }
    }
    if (form.role === 'party' && !String(form.adminEmail || '').trim()) {
      setError('Enter your business administrator\'s email so they can approve your account.');
      return;
    }
    setIsSubmitting(true);
    try {
      const raw = await signup(form);
      const payload = raw?.data || raw || {};
      const token = payload.token || payload.accessToken;

      if (token) {
        refreshSession(normalizeAuthResponse(raw));
        navigate('/', { replace: true });
        return;
      }

      const u = payload.user;
      const baseMsg = payload.message;

      if (u?.role === 'party' && u?.status === 'pending') {
        setMessage(
          `${baseMsg || 'Account created and waiting for approval.'} You can log in after your business administrator approves your account.`,
        );
      } else if (u?.role === 'admin' && u?.status === 'approved') {
        setMessage(baseMsg || 'Organization administrator created — you can sign in.');
      } else {
        setMessage(baseMsg || 'Account created.');
      }

      setForm({
        name: '', email: '', password: '', role: 'party', partyName: '', adminEmail: '',
      });
    } catch (err) {
      setError(err.message || 'Unable to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create account"
      subtitle="The first account is the organization administrator. After that, everyone else joins as a party user with the admin's email."
      sideTitle="One admin manages multiple businesses (workspaces); each business keeps its own lots, payments, and ledgers."
      sideText="Party users enter their administrator's email and are approved only by that admin."
      footer={<>Already have an account? <Link className="auth-inline-link" to="/login">Login</Link></>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-warning">
            {error}
          </div>
        )}

        {message && (
          <div className="alert alert-success">
            {message}
          </div>
        )}

        <fieldset className="auth-label" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="auth-label-text" style={{ marginBottom: 8 }}>Account type</legend>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="radio"
                name="role"
                checked={form.role === 'party'}
                onChange={() => setForm((f) => ({ ...f, role: 'party' }))}
              />
              Party
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="radio"
                name="role"
                checked={form.role === 'admin'}
                onChange={() => setForm((f) => ({ ...f, role: 'admin' }))}
              />
              Business administrator
            </label>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 8, marginBottom: 0 }}>
            If no administrator exists yet, choose Business administrator to create the one org admin. Only one administrator is allowed; additional staff sign up as party users.
          </p>
        </fieldset>

        <label className="auth-label">
          <span className="auth-label-text">Name</span>
          <input
            className="form-input"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            autoFocus
          />
        </label>

        <label className="auth-label">
          <span className="auth-label-text">Email</span>
          <input
            className="form-input"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </label>

        <label className="auth-label">
          <span className="auth-label-text">Password</span>
          <input
            className="form-input"
            type="password"
            placeholder="Minimum 8 characters"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            minLength={8}
            required
          />
        </label>

        {form.role === 'party' && (
          <>
            <label className="auth-label">
              <span className="auth-label-text">Business administrator email *</span>
              <input
                className="form-input"
                type="email"
                placeholder="Email of the admin whose organization you are joining"
                value={form.adminEmail}
                onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                required
              />
            </label>
            <label className="auth-label">
              <span className="auth-label-text">Party / company name</span>
              <input
                className="form-input"
                placeholder="Name your admin will recognize"
                value={form.partyName}
                onChange={(e) => setForm((f) => ({ ...f, partyName: e.target.value }))}
              />
            </label>
          </>
        )}

        <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
          {isSubmitting ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>
    </AuthCard>
  );
}
