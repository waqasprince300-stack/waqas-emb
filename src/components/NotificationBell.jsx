import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Bell + dropdown inbox for lot reject / pending-review notifications. */
export default function NotificationBell() {
  const { isAuthenticated, isAdmin, isParty, isSuperAdmin, isPersonalKhata } = useAuth();
  const {
    notifications,
    notificationUnreadCount,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const show =
    isAuthenticated &&
    !isSuperAdmin &&
    !isPersonalKhata &&
    (isAdmin || isParty);

  useEffect(() => {
    if (!show) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [show]);

  if (!show) return null;

  const unread = Number(notificationUnreadCount) || 0;
  const list = Array.isArray(notifications) ? notifications : [];

  const openItem = async (n) => {
    if (!n?.readAt && n?.id) {
      await markNotificationRead(n.id);
    }
    setOpen(false);
    const path = String(n?.linkPath || '').trim();
    if (path.startsWith('/')) navigate(path);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="app-notif-bell"
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        title="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refreshNotifications();
        }}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: 10,
          border: '1px solid var(--border, #e2e8f0)',
          background: '#fff',
          color: '#334155',
          cursor: 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            className="app-notif-panel"
            style={{
              position: 'fixed',
              top: 56,
              right: 16,
              width: 'min(360px, calc(100vw - 24px))',
              maxHeight: 'min(70vh, 420px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              boxShadow: '0 12px 40px rgba(15,23,42,0.18)',
              zIndex: 500,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '12px 14px',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <strong style={{ fontSize: 14 }}>Notifications</strong>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllNotificationsRead()}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#2563eb',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {list.length === 0 ? (
                <p style={{ padding: 16, margin: 0, fontSize: 13, color: '#64748b' }}>
                  No notifications yet.
                </p>
              ) : (
                list.map((n) => {
                  const unreadRow = !n.readAt;
                  return (
                    <button
                      key={n.id || n._id}
                      type="button"
                      onClick={() => void openItem(n)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderBottom: '1px solid #f1f5f9',
                        background: unreadRow ? '#eff6ff' : '#fff',
                        padding: '12px 14px',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: unreadRow ? 700 : 600,
                          color: '#0f172a',
                          marginBottom: 4,
                        }}
                      >
                        {n.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>
                        {n.body}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                        {formatWhen(n.createdAt)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Shows a toast when realtime payload has lot_rejected / lot_pending_review for this role.
 * Must render inside BrowserRouter.
 */
export function LotNotificationListener() {
  const { isAdmin, isParty } = useAuth();
  const { pendingLotNotice, clearPendingLotNotice, refreshNotifications } = useApp();
  const navigate = useNavigate();
  const shownRef = useRef('');

  useEffect(() => {
    if (!pendingLotNotice) return;
    const key = `${pendingLotNotice.action}:${pendingLotNotice.lotId}:${pendingLotNotice.at || ''}`;
    if (shownRef.current === key) return;

    const action = String(pendingLotNotice.action || '');
    const forParty = action === 'lot_rejected' && isParty;
    const forAdmin = action === 'lot_pending_review' && isAdmin;
    if (!forParty && !forAdmin) {
      clearPendingLotNotice?.();
      return;
    }

    shownRef.current = key;
    void refreshNotifications?.();

    const title =
      action === 'lot_rejected' ? 'Lot rejected' : 'Lot awaiting your review';
    const text =
      action === 'lot_rejected'
        ? 'A lot was rejected. Open it from Party Ledger to fix and resubmit.'
        : 'A party submitted a lot for completion approval.';
    const linkPath = String(pendingLotNotice.linkPath || '').trim();

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: action === 'lot_rejected' ? 'warning' : 'info',
      title,
      text,
      showConfirmButton: Boolean(linkPath),
      confirmButtonText: 'Open',
      showCancelButton: true,
      cancelButtonText: 'Dismiss',
      timer: 12000,
      timerProgressBar: true,
    }).then((result) => {
      clearPendingLotNotice?.();
      if (result.isConfirmed && linkPath.startsWith('/')) {
        navigate(linkPath);
      }
    });
  }, [
    pendingLotNotice,
    isAdmin,
    isParty,
    navigate,
    clearPendingLotNotice,
    refreshNotifications,
  ]);

  return null;
}
