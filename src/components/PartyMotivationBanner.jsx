import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

const TYPE_STYLES = {
  achievement: {
    bg: 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(5,150,105,0.06) 100%)',
    border: 'var(--success, #10b981)',
    color: 'var(--success, #059669)',
    glow: 'rgba(16,185,129,0.15)',
  },
  encouragement: {
    bg: 'linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(37,99,235,0.06) 100%)',
    border: 'var(--primary-light, #3b82f6)',
    color: 'var(--primary-light, #2563eb)',
    glow: 'rgba(59,130,246,0.15)',
  },
  warning: {
    bg: 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(217,119,6,0.06) 100%)',
    border: 'var(--warning, #f59e0b)',
    color: 'var(--warning, #d97706)',
    glow: 'rgba(245,158,11,0.15)',
  },
};

export default function PartyMotivationBanner() {
  const { partyMotivation } = useApp();
  const { isParty, user } = useAuth();
  
  const [collapsed, setCollapsed] = useState(true);

  const storageKey = `motivationLastDismissed_${user?.id || user?._id || 'unknown'}`;

  useEffect(() => {
    if (!isParty) return;
    const lastDismissed = localStorage.getItem(storageKey);
    if (!lastDismissed) {
      setCollapsed(false);
    } else {
      const daysSinceDismissed = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed > 3) {
        setCollapsed(false);
      }
    }
  }, [isParty, storageKey]);

  const handleDismiss = () => {
    setCollapsed(true);
    localStorage.setItem(storageKey, Date.now().toString());
  };

  if (!isParty || !partyMotivation?.messages?.length) return null;

  const { messages, stats } = partyMotivation;

  if (collapsed) {
    return (
      <button
        className="motivation-collapsed-btn"
        onClick={() => setCollapsed(false)}
        type="button"
      >
        <span className="motivation-collapsed-icon">💡</span>
        <span>Aap ki performance dekhein</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    );
  }

  return (
    <div className="motivation-banner" onClick={handleDismiss} title="Click anywhere to close">
      <div className="motivation-header">
        <div className="motivation-header-left">
          <span className="motivation-header-icon">💡</span>
          <span className="motivation-header-title">Aap Ki Performance</span>
        </div>
        <div
          className="motivation-close-btn"
          aria-label="Close"
        >
          ✕
        </div>
      </div>

      {stats && stats.totalLots > 0 && (
        <div className="motivation-stats-row">
          {stats.completedCount != null && (
            <div className="motivation-stat">
              <span className="motivation-stat-value">{stats.completedCount}</span>
              <span className="motivation-stat-label">Complete</span>
            </div>
          )}
          {stats.avgReturnDays != null && (
            <div className="motivation-stat">
              <span className="motivation-stat-value">{stats.avgReturnDays}d</span>
              <span className="motivation-stat-label">Avg Return</span>
            </div>
          )}
          {stats.streak > 0 && (
            <div className="motivation-stat">
              <span className="motivation-stat-value">{stats.streak}🔥</span>
              <span className="motivation-stat-label">Streak</span>
            </div>
          )}
          {stats.rejectionRate != null && (
            <div className="motivation-stat">
              <span className="motivation-stat-value" style={stats.rejectionRate > 15 ? { color: 'var(--danger, #ef4444)' } : {}}>
                {stats.rejectionRate}%
              </span>
              <span className="motivation-stat-label">Rejection</span>
            </div>
          )}
        </div>
      )}

      <div className="motivation-messages">
        {messages.map((msg, idx) => {
          const style = TYPE_STYLES[msg.type] || TYPE_STYLES.encouragement;
          return (
            <div
              key={idx}
              className="motivation-msg"
              style={{
                background: style.bg,
                borderLeft: `3px solid ${style.border}`,
                boxShadow: `0 2px 8px ${style.glow}`,
                animationDelay: `${idx * 120}ms`,
              }}
            >
              <span className="motivation-msg-icon">{msg.icon}</span>
              <div className="motivation-msg-content">
                <span className="motivation-msg-title" style={{ color: style.color }}>
                  {msg.title}
                </span>
                <span className="motivation-msg-body">{msg.body}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
