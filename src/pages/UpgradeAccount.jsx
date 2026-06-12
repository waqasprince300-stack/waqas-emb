import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../utils/formatApiError';

const brandLogoSrc = `${process.env.PUBLIC_URL || ''}/seam-grace-logo.png`;

export default function UpgradeAccount() {
  const { isAuthenticated, user, isPersonalKhata, upgradeAccount, logout } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    targetRole: 'admin',
    email: '',
    adminEmail: '',
    partyName: '',
  });
  const [error, setError] = useState('');
  const [pendingMsg, setPendingMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/personal-khata/account" replace />;
  }
  if (!isPersonalKhata) {
    return <Navigate to="/" replace />;
  }

  const needsEmail = !user?.email;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setPendingMsg('');

    if (needsEmail && !String(form.email || '').trim()) {
      setError('Add an email address — business accounts sign in with email.');
      return;
    }
    if (form.targetRole === 'party' && !String(form.adminEmail || '').trim()) {
      setError('Enter your business administrator email so they can approve you.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = { targetRole: form.targetRole };
      if (needsEmail) payload.email = form.email.trim();
      if (form.targetRole === 'party') {
        payload.adminEmail = form.adminEmail.trim();
        if (form.partyName.trim()) payload.partyName = form.partyName.trim();
      }
      const res = await upgradeAccount(payload);
      if (res?.loggedIn) {
        navigate('/', { replace: true });
        return;
      }
      setPendingMsg(res?.message || 'Upgrade requested. You can sign in once it is approved.');
    } catch (err) {
      setError(formatApiError(err, 'Unable to upgrade account'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      brandLogoSrc={brandLogoSrc}
      brandKicker="Upgrade account"
      title="Upgrade to a business account"
      subtitle="Turn your Personal Khata login into a business administrator or party account. Your khata data stays linked to the same account."
      sideTitle="Keep your khata — gain the full workspace."
      sideText="Upgrading keeps your existing Personal Khata data and ledger. Admin and party accounts unlock lots, parties, payments, and reporting."
      footer={<>Back to <Link className="auth-inline-link" to="/personal-khata">Personal Khata</Link></>}
    >
      {pendingMsg ? (
        <div>
          <div className="alert alert-success">{pendingMsg}</div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            onClick={() => { logout(); navigate('/login', { replace: true }); }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="alert alert-warning">{error}</div>}

          <fieldset className="auth-label" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="auth-label-text" style={{ marginBottom: 8 }}>Upgrade to</legend>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                <input
                  type="radio"
                  name="targetRole"
                  checked={form.targetRole === 'admin'}
                  onChange={() => setForm((f) => ({ ...f, targetRole: 'admin' }))}
                />
                Business administrator
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                <input
                  type="radio"
                  name="targetRole"
                  checked={form.targetRole === 'party'}
                  onChange={() => setForm((f) => ({ ...f, targetRole: 'party' }))}
                />
                Party
              </label>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 8, marginBottom: 0 }}>
              Admins may need platform super-administrator approval; party accounts need their business administrator’s approval. While pending you cannot sign in, but your khata data is safe.
            </p>
          </fieldset>

          {needsEmail && (
            <label className="auth-label">
              <span className="auth-label-text">Email *</span>
              <input
                className="form-input"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </label>
          )}

          {form.targetRole === 'party' && (
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
            {isSubmitting ? 'Submitting…' : 'Upgrade account'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
