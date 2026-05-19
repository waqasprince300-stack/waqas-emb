import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import PasswordField from '../components/PasswordField';
import { useAuth, normalizeAuthResponse } from '../context/AuthContext';
import { getRegistrationEmailError } from '../utils/registrationEmail';
import { formatApiError } from '../utils/formatApiError';

const brandLogoSrc = `${process.env.PUBLIC_URL || ''}/seam-grace-logo.png`;

export default function Signup() {
  const { isAuthenticated, user, signup, refreshSession } = useAuth();
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
    const to =
      user?.role === 'super_admin'
        ? '/super-admin/pending-admins'
        : user?.role === 'personal_khata'
          ? '/personal-khata'
          : '/';
    return <Navigate to={to} replace />;
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
        const session = normalizeAuthResponse(raw);
        refreshSession(session);
        const u = session.user;
        const dest =
          u?.role === 'super_admin'
            ? '/super-admin/pending-admins'
            : u?.role === 'personal_khata'
              ? '/personal-khata'
              : '/';
        navigate(dest, { replace: true });
        return;
      }

      const u = payload.user;
      const baseMsg = payload.message;

      if (u?.role === 'party' && u?.status === 'pending') {
        setMessage(
          `${baseMsg || 'Account created and waiting for approval.'} You can log in after your business administrator approves your account.`,
        );
      } else if (u?.role === 'admin' && u?.status === 'pending') {
        setMessage(
          baseMsg
          || 'Your administrator account was created. You cannot sign in until the platform super administrator verifies and approves you.',
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
      setError(formatApiError(err, 'Unable to create account'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      brandLogoSrc={brandLogoSrc}
      brandKicker="Embroidery workspace"
      title="Create account"
      subtitle="Party users join an existing organization with their business administrator’s email. Additional business administrators can register and are activated after platform verification."
      sideTitle="Super administrator verifies each new organization admin. Each approved admin can run their own workspaces and approve their party users."
      sideText="Use a real email you control — disposable and test addresses are blocked. Party users are approved only by the business admin they selected."
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
            When a platform super administrator is set up, each new business administrator must be verified before they can sign in. Multiple approved administrators can exist; party users pick which one they belong to.
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
            placeholder="you@company.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </label>

        <label className="auth-label">
          <span className="auth-label-text">Password</span>
          <PasswordField
            name="password"
            placeholder="Minimum 8 characters"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            minLength={8}
            required
            autoComplete="new-password"
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
