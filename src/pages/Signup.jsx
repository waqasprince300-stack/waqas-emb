import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const { parties } = useApp();
  const { isAuthenticated, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin',
    partyId: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedParty = useMemo(
    () => parties.find((party) => String(party.id) === String(form.partyId)),
    [parties, form.partyId],
  );

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.role === 'party' && !form.partyId) {
      setError('Select the party this account belongs to.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signup({
        ...form,
        partyName: selectedParty?.name || '',
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create account"
      subtitle="Set up secure access for admins or party users."
      sideTitle="Give every party the right view of work and payments."
      sideText="Create accounts for staff and parties while keeping admin-only pages protected."
      footer={<>Already have an account? <Link className="auth-inline-link" to="/login">Login</Link></>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-warning">
            {error}
          </div>
        )}

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

        <label className="auth-label">
          <span className="auth-label-text">Account Type</span>
          <select
            className="form-select"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, partyId: '' }))}
          >
            <option value="admin">Admin</option>
            <option value="party">Party</option>
          </select>
        </label>

        {form.role === 'party' && (
          <label className="auth-label">
            <span className="auth-label-text">Party</span>
            <select
              className="form-select"
              value={form.partyId}
              onChange={(e) => setForm((f) => ({ ...f, partyId: e.target.value }))}
              required
            >
              <option value="">Select party</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>{party.name}</option>
              ))}
            </select>
          </label>
        )}

        <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
          {isSubmitting ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>
    </AuthCard>
  );
}
