import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function MarqueeBanner() {
  const { activeAnnouncement } = useApp();
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    setIsExpired(false);
    if (activeAnnouncement?.expiresAt) {
      const msUntilExpiry = new Date(activeAnnouncement.expiresAt).getTime() - Date.now();
      if (msUntilExpiry <= 0) {
        setIsExpired(true);
      } else {
        const timer = setTimeout(() => setIsExpired(true), msUntilExpiry);
        return () => clearTimeout(timer);
      }
    }
  }, [activeAnnouncement]);

  if (!activeAnnouncement || activeAnnouncement.isActive === false || isExpired) {
    return null;
  }

  // Determine colors based on severity
  let bgColor = 'var(--primary)'; // Info (blue)
  let textColor = '#fff';
  let icon = '📢';

  if (activeAnnouncement.severity === 'warning') {
    bgColor = 'var(--warning)'; // Orange/Yellow
    icon = '⚠️';
  } else if (activeAnnouncement.severity === 'urgent') {
    bgColor = 'var(--danger)'; // Red
    icon = '🔥';
  } else if (activeAnnouncement.severity === 'success') {
    bgColor = 'var(--success)'; // Green
    icon = '🌟';
  }

  return (
    <div 
      className="marquee-container" 
      style={{ 
        background: bgColor, 
        color: textColor 
      }}
    >
      <div className="marquee-text">
        <span style={{ margin: '0 50px' }}>
          <strong>{icon} {activeAnnouncement.title}</strong>: {activeAnnouncement.body}
        </span>
        <span style={{ margin: '0 50px' }}>
          <strong>{icon} {activeAnnouncement.title}</strong>: {activeAnnouncement.body}
        </span>
        <span style={{ margin: '0 50px' }}>
          <strong>{icon} {activeAnnouncement.title}</strong>: {activeAnnouncement.body}
        </span>
      </div>
    </div>
  );
}
