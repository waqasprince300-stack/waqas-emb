import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import usePushNotifications from '../hooks/usePushNotifications';

export default function PartyPushNotificationBanner() {
  const { isParty, user, isAuthenticated } = useAuth();
  const {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    subscribeToPush,
  } = usePushNotifications({ isAuthenticated, autoSyncIfGranted: true });

  const [dismissed, setDismissed] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDeniedGuide, setShowDeniedGuide] = useState(false);

  const storageKey = `party_push_dismissed_${user?.id || user?._id || 'party'}`;

  // Check dismissal state from localStorage
  useEffect(() => {
    if (!isParty) return;

    try {
      const dismissedUntil = localStorage.getItem(storageKey);
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, [isParty, storageKey]);

  // If already subscribed or permission was granted and subscribed, keep it hidden
  useEffect(() => {
    if (isSubscribed) {
      setDismissed(true);
    }
  }, [isSubscribed]);

  // Handle dismiss (hide for 48 hours)
  const handleDismiss = () => {
    setDismissed(true);
    try {
      const twoDaysLater = Date.now() + 48 * 60 * 60 * 1000;
      localStorage.setItem(storageKey, String(twoDaysLater));
    } catch {
      /* ignore */
    }
  };

  // Handle CTA Click
  const handleEnableNotifications = async () => {
    setShowDeniedGuide(false);
    try {
      const result = await subscribeToPush();
      if (result?.success) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setDismissed(true);
        }, 4000);
      }
    } catch (err) {
      if (Notification.permission === 'denied') {
        setShowDeniedGuide(true);
      }
    }
  };

  // Check iOS device
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream;
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

  // If not party user or unsupported or dismissed or already subscribed, don't show
  if (!isParty || !isSupported || dismissed || (isSubscribed && !showSuccess)) {
    return null;
  }

  // Success state
  if (showSuccess) {
    return (
      <div
        className="party-push-banner party-push-banner--success animate-fade-in"
        style={{
          margin: '0 auto 16px',
          maxWidth: 900,
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)',
          border: '1.5px solid var(--success, #10b981)',
          borderRadius: 14,
          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 24, lineHeight: 1 }}>🎉</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success, #059669)', marginBottom: 2 }}>
            Notifications On Ho Gayi Hain!
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #475569)' }}>
            Shukriya! Ab har naye payment aur lot update ka notification aap ko mobile par foran milay ga.
          </div>
        </div>
      </div>
    );
  }

  // Denied / Blocked state
  if (permission === 'denied' || showDeniedGuide) {
    return (
      <div
        className="party-push-banner party-push-banner--denied animate-fade-in"
        style={{
          margin: '0 auto 16px',
          maxWidth: 900,
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.08) 100%)',
          border: '1.5px solid var(--warning, #f59e0b)',
          borderRadius: 14,
          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--warning, #d97706)' }}>
              Browser Mein Notifications Block Hain
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              color: 'var(--text-muted, #94a3b8)',
              padding: '2px 6px',
              borderRadius: 6,
            }}
            title="Band karein"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--text-primary)', marginTop: 8, lineHeight: 1.5 }}>
          Aap k browser ne notifications block ki hui hain. Alerts hasil karne k liye:
          <ol style={{ margin: '6px 0 8px 18px', padding: 0 }}>
            <li>Browser k search bar k sath <strong>🔒 Lock</strong> ya Settings icon par click karein.</li>
            <li><strong>Permissions</strong> ya <strong>Site settings</strong> mein <em>Notifications</em> ko <strong>Allow</strong> karein.</li>
            <li>Page ko reload / refresh karein.</li>
          </ol>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => window.location.reload()}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8 }}
          >
            🔄 Page Refresh Karein
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleDismiss}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8 }}
          >
            Baad mein karunga
          </button>
        </div>
      </div>
    );
  }

  // Normal Prompt Banner
  return (
    <div
      className="party-push-banner animate-fade-in"
      style={{
        margin: '0 auto 16px',
        maxWidth: 900,
        padding: '14px 18px',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.10) 0%, rgba(37, 99, 235, 0.05) 100%)',
        border: '1.5px solid var(--primary-light, #3b82f6)',
        borderRadius: 14,
        boxShadow: '0 4px 16px rgba(59, 130, 246, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'color-mix(in srgb, var(--primary, #3b82f6) 18%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            🔔
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
              Payment & Lot Updates Miss Na Karein!
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #64748b)', marginTop: 2 }}>
              Admin jab bhi payment send karega ya lot ka status change hoga, aap ko phone par foran alert milay ga.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'var(--primary-bg, #f1f5f9)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-muted, #64748b)',
            width: 26,
            height: 26,
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Band karein (48 ghantay k liye)"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* iOS standalone helper tip */}
      {isIOS && !isStandalone && (
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-secondary)',
            background: 'rgba(255, 255, 255, 0.4)',
            padding: '4px 10px',
            borderRadius: 6,
            margin: '8px 0 4px',
            border: '1px dashed var(--border)',
          }}
        >
          📱 <strong>iPhone users:</strong> Safari mein Share (⬆️) daba kar &ldquo;Add to Home Screen&rdquo; karein taake phone notifications support kare.
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--danger, #ef4444)', marginTop: 6, fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={handleEnableNotifications}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.25)',
          }}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <span>Active Ho Raha Hai...</span>
            </>
          ) : (
            <>
              <span>🔔</span>
              <span>Notifications On Karein</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: '1px solid var(--border, #cbd5e1)',
            color: 'var(--text-secondary, #64748b)',
            padding: '6px 14px',
            fontSize: 12.5,
            fontWeight: 600,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Abhi Nahi
        </button>
      </div>
    </div>
  );
}
