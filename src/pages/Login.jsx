import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    try {
      login(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to login');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F0F2F5', padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow)' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: '#111827' }}>Ghausia</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Login with your local admin or party account</div>
        </div>

        {error && (
          <div className="alert alert-warning" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Email</span>
          <input
            className="form-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            autoFocus
          />
        </label>

        <label style={{ display: 'block', marginBottom: 18 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Password</span>
          <input
            className="form-input"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
          Login
        </button>

        <div style={{ marginTop: 18, fontSize: 13, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Need a local account? <Link to="/signup">Sign up</Link>
        </div>
      </form>
    </div>
  );
}
