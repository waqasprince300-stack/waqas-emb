import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { useAuth } from '../context/AuthContext';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setResetLink('');
    setIsSubmitting(true);

    try {
      const response = await forgotPassword({ email });
      const payload = response?.data || response || {};
      setMessage(payload.message || 'If an account exists for this email, a reset link has been sent.');
      setResetLink(payload.resetUrl || payload.resetLink || '');
    } catch (err) {
      setError(err.message || 'Unable to send reset instructions');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Recover password"
      subtitle="Enter your email and we will send a secure reset link."
      sideTitle="Reset access without losing your work history."
      sideText="Password recovery uses a short-lived token so accounts can be restored safely."
      footer={<>Remembered your password? <Link className="auth-inline-link" to="/login">Login</Link></>}
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
            {resetLink && (
              <div style={{ marginTop: 8 }}>
                <a className="auth-inline-link" href={resetLink}>Open reset link</a>
              </div>
            )}
          </div>
        )}

        <label className="auth-label">
          <span className="auth-label-text">Email</span>
          <input
            className="form-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
          {isSubmitting ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
    </AuthCard>
  );
}
