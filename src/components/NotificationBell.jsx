import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatDisplayDateTime } from '../utils/dateFilters';

function formatWhen(iso) {
  return formatDisplayDateTime(iso, '');
}

function resolveLinkPath(n) {
  const path = String(n?.linkPath || '').trim();
  if (path.startsWith('/')) return path;
  const lotId = String(n?.lotId || '').trim();
  if (!lotId) return '';
  const type = String(n?.type || '').trim();
  if (type === 'lot_pending_review') {
    return `/review-lots?lotId=${encodeURIComponent(lotId)}`;
  }
  if (type === 'bill_revision_request') {
    return `/party-ledger?lotId=${encodeURIComponent(lotId)}&billReview=1`;
  }
  if (
    type === 'lot_rejected' ||
    type === 'bill_revision_approved' ||
    type === 'bill_revision_rejected'
  ) {
    return `/party-ledger?lotId=${encodeURIComponent(lotId)}`;
  }
  if (type === 'payment_recorded') {
    return '/payments';
  }
  return '';
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
  const panelRef = useRef(null);

  const show = isAuthenticated && !isSuperAdmin && !isPersonalKhata && (isAdmin || isParty);

  useEffect(() => {
    if (!show || !open) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Use click (not mousedown) so item/button handlers run first.
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [show, open]);

  if (!show) return null;

  const unread = Number(notificationUnreadCount) || 0;
  const list = Array.isArray(notifications) ? notifications : [];
  // Inbox shows unread only — once read (or mark-all), they leave the bell list.
  const visibleList = list.filter((n) => !n.readAt);

  const openItem = async (n, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const id = n?.id || n?._id;
    const path = resolveLinkPath(n);
    setOpen(false);
    if (!n?.readAt && id) {
      void markNotificationRead(id);
    }
    if (path.startsWith('/')) {
      navigate(path);
    }
  };

  const onMarkAll = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    await markAllNotificationsRead();
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="app-notif-bell"
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        title="Notifications"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (!v) void refreshNotifications();
            return next;
          });
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
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
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
            ref={panelRef}
            className="app-notif-panel"
            role="dialog"
            aria-label="Notifications"
            onClick={(e) => e.stopPropagation()}
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
                  onClick={(e) => void onMarkAll(e)}
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
              {visibleList.length === 0 ? (
                <p style={{ padding: 16, margin: 0, fontSize: 13, color: '#64748b' }}>
                  {list.length === 0
                    ? 'No notifications yet.'
                    : 'All caught up — no unread notifications.'}
                </p>
              ) : (
                visibleList.map((n) => (
                  <button
                    key={n.id || n._id}
                    type="button"
                    onClick={(e) => void openItem(n, e)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #f1f5f9',
                      background: '#eff6ff',
                      padding: '12px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#0f172a',
                        marginBottom: 4,
                      }}
                    >
                      {n.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{n.body}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                      {formatWhen(n.createdAt)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/**
 * Shows a toast when realtime payload has lot_rejected / pending review / bill revision for this role.
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
    const forParty =
      (action === 'lot_rejected' ||
        action === 'bill_revision_approved' ||
        action === 'bill_revision_rejected' ||
        action === 'payment_recorded') &&
      isParty;
    const forAdmin =
      (action === 'lot_pending_review' || action === 'bill_revision_request') && isAdmin;
    if (!forParty && !forAdmin) {
      clearPendingLotNotice?.();
      return;
    }

    shownRef.current = key;
    void refreshNotifications?.();

    const title =
      action === 'lot_rejected'
        ? 'Lot rejected'
        : action === 'bill_revision_request'
          ? 'Bill change request'
          : action === 'bill_revision_approved'
            ? 'Bill change approved'
            : action === 'bill_revision_rejected'
              ? 'Bill change rejected'
              : action === 'payment_recorded'
                ? 'New payment'
                : 'Lot awaiting your review';
    const text =
      action === 'lot_rejected'
        ? isParty
          ? 'A lot was rejected. Open it from My Lots to fix and resubmit.'
          : 'A lot was rejected. Open it from Party Ledger to fix and resubmit.'
        : action === 'bill_revision_request'
          ? 'A party requested a bill change. Open Party Ledger to review that lot.'
          : action === 'bill_revision_approved'
            ? 'The business approved your bill change. Open My Lots to see the updated amount.'
            : action === 'bill_revision_rejected'
              ? 'The business rejected your bill change. Open My Lots to review.'
              : action === 'payment_recorded'
                ? 'The business recorded a payment for your account. Open My Payments to review.'
                : 'A party submitted a lot for completion approval.';
    const linkPath =
      String(pendingLotNotice.linkPath || '').trim() ||
      (action === 'payment_recorded' ? '/payments' : '');

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon:
        action === 'lot_rejected' || action === 'bill_revision_rejected'
          ? 'warning'
          : action === 'bill_revision_approved' || action === 'payment_recorded'
            ? 'success'
            : 'info',
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
  }, [pendingLotNotice, isAdmin, isParty, navigate, clearPendingLotNotice, refreshNotifications]);

  return null;
}
