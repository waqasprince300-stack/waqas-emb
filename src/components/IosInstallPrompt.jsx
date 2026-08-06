import React, { useState, useEffect } from 'react';

export default function IosInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Detect if device is iOS
    const isIos = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };

    // Detect if app is already installed (standalone mode)
    const isStandalone = () => {
      return ('standalone' in window.navigator) && (window.navigator.standalone);
    };

    // Show prompt if iOS and not installed
    if (isIos() && !isStandalone()) {
      // Optional: Check if we've already dismissed it
      const hasDismissed = localStorage.getItem('iosInstallPromptDismissed');
      if (!hasDismissed) {
        setShowPrompt(true);
      }
    }
  }, []);

  const dismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('iosInstallPromptDismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: 400,
        backgroundColor: 'var(--bg-card, #2c2928)',
        color: '#fff',
        padding: '16px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        border: '1px solid var(--border-color, #3e3a39)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: '1rem' }}>Install App on iPhone</h4>
        <button
          onClick={dismiss}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem' }}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.4 }}>
        To install this app on your iPhone, tap the <strong>Share</strong> icon at the bottom of Safari and select <strong>&quot;Add to Home Screen&quot;</strong>.
      </p>
    </div>
  );
}
