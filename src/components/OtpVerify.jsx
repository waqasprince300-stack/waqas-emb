import React, { useEffect, useRef, useState } from 'react';

const CHANNEL_LABEL = { email: 'Email', sms: 'SMS' };

/**
 * Reusable one-time-code step (new-device login + password reset).
 * Manages the code input, a resend cooldown, and optional channel switching.
 */
export default function OtpVerify({
  title = 'Enter verification code',
  destinationMasked,
  channel,
  channels = [],
  devCode,
  deliveryNote,
  error,
  submitting = false,
  submitLabel = 'Verify',
  extraFields = null,
  onSubmit,
  onResend,
  onBack,
}) {
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState('');
  const [resending, setResending] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    timerRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(code.trim());
  };

  const doResend = async (nextChannel) => {
    if (cooldown > 0 || resending) return;
    setResendMsg('');
    setResending(true);
    try {
      const res = await onResend?.(nextChannel);
      const where = res?.destinationMasked ? ` to ${res.destinationMasked}` : '';
      setResendMsg(`A new code was sent${where}.`);
      setCooldown(30);
    } catch {
      setResendMsg('Could not resend the code. Try again.');
    } finally {
      setResending(false);
    }
  };

  const otherChannels = (channels || []).filter((c) => c !== channel);

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-card-header" style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 20 }}>{title}</h2>
        {destinationMasked && (
          <p style={{ margin: 0 }}>
            We sent a 6-digit code via {CHANNEL_LABEL[channel] || 'message'} to{' '}
            <strong>{destinationMasked}</strong>.
          </p>
        )}
      </div>

      {error && <div className="alert alert-warning">{error}</div>}
      {resendMsg && <div className="alert alert-success">{resendMsg}</div>}

      {devCode && (
        <div
          className="alert"
          style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}
        >
          <strong>Testing mode:</strong> your code is{' '}
          <code style={{ fontWeight: 700 }}>{devCode}</code>
          {deliveryNote ? <div style={{ marginTop: 4, fontSize: 12 }}>{deliveryNote}</div> : null}
        </div>
      )}

      <label className="auth-label">
        <span className="auth-label-text">Verification code</span>
        <input
          className="form-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
          autoFocus
          style={{ letterSpacing: 6, fontSize: 18, textAlign: 'center' }}
        />
      </label>

      {extraFields}

      <button
        className="btn btn-primary"
        type="submit"
        disabled={submitting || code.length < 4}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {submitting ? 'Please wait…' : submitLabel}
      </button>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4, fontSize: 13 }}>
        <button
          type="button"
          className="auth-inline-link"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            font: 'inherit',
          }}
          onClick={() => doResend(channel)}
          disabled={cooldown > 0 || resending}
        >
          {cooldown > 0 ? `Resend code (${cooldown}s)` : resending ? 'Sending…' : 'Resend code'}
        </button>

        {otherChannels.map((c) => (
          <button
            key={c}
            type="button"
            className="auth-inline-link"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              font: 'inherit',
            }}
            onClick={() => doResend(c)}
            disabled={resending}
          >
            Send to {CHANNEL_LABEL[c] || c} instead
          </button>
        ))}

        {onBack && (
          <button
            type="button"
            className="auth-inline-link"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              font: 'inherit',
              marginLeft: 'auto',
            }}
            onClick={onBack}
          >
            Back
          </button>
        )}
      </div>
    </form>
  );
}
