import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
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

  const selectedParty = useMemo(
    () => parties.find((party) => String(party.id) === String(form.partyId)),
    [parties, form.partyId],
  );

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    if (form.role === 'party' && !form.partyId) {
      setError('Select the party this account belongs to.');
      return;
    }
    signup({
      ...form,
      partyName: selectedParty?.name || '',
    });
    navigate('/', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F0F2F5', padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 460, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow)' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: '#111827' }}>Create Account</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Frontend-only account for local access control</div>
        </div>

        {error && (
          <div className="alert alert-warning" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Name</span>
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            autoFocus
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Email</span>
          <input
            className="form-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Password</span>
          <input
            className="form-input"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Account Type</span>
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
          <label style={{ display: 'block', marginBottom: 18 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Party</span>
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

        <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
          Sign Up
        </button>

        <div style={{ marginTop: 18, fontSize: 13, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Already have an account? <Link to="/login">Login</Link>
        </div>
      </form>
    </div>
  );
}
