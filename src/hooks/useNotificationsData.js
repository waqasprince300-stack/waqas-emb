import { useState, useCallback, useEffect } from 'react';
import { apiService } from '../services/api';

export function useNotificationsData({ isAuthenticated, userRole }) {
  const [notifications, setNotifications] = useState([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [pendingLotNotice, setPendingLotNotice] = useState(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [partyMotivation, setPartyMotivation] = useState(null);

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    if (userRole !== 'admin' && userRole !== 'party') return;
    try {
      const [list, countRes, broadcasts] = await Promise.all([
        apiService.getNotifications(),
        apiService.getNotificationUnreadCount(),
        apiService.getActiveBroadcasts(),
      ]);
      setNotifications(Array.isArray(list) ? list : []);
      setNotificationUnreadCount(Number(countRes?.count) || 0);
      
      if (Array.isArray(broadcasts) && broadcasts.length > 0) {
        setActiveAnnouncement(broadcasts[0]);
      } else {
        setActiveAnnouncement(null);
      }
    } catch (err) {
      console.warn('Notifications refresh failed', err);
    }
  }, [isAuthenticated, userRole]);

  const refreshPartyMotivation = useCallback(async () => {
    if (!isAuthenticated || userRole !== 'party') return;
    try {
      const result = await apiService.getPartyMotivation();
      setPartyMotivation(result || null);
    } catch (err) {
      console.warn('Party motivation fetch failed', err);
    }
  }, [isAuthenticated, userRole]);

  const markNotificationRead = useCallback(async (id) => {
    if (!id) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) =>
        String(n.id || n._id) === String(id)
          ? { ...n, readAt: n.readAt || now }
          : n
      )
    );
    setNotificationUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiService.markNotificationRead(id);
    } catch (err) {
      console.warn('Mark notification read failed', err);
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setNotificationUnreadCount(0);
    setPendingLotNotice(null);
    try {
      await apiService.markAllNotificationsRead();
    } catch (err) {
      console.warn('Mark all notifications read failed', err);
    }
  }, []);

  const markNotificationsReadByContext = useCallback(
    async ({ category, type, types, lotId } = {}) => {
      if (!isAuthenticated) return;
      const now = new Date().toISOString();
      let matchedCount = 0;

      setNotifications((prev) =>
        prev.map((n) => {
          if (n.readAt) return n;
          let match = false;
          if (lotId && String(n.lotId || '').trim() === String(lotId).trim()) match = true;
          if (type && String(n.type || '') === type) match = true;
          if (Array.isArray(types) && types.includes(String(n.type || ''))) match = true;
          if (category === 'review_lots' && String(n.type || '') === 'lot_pending_review') match = true;
          if (
            category === 'party_ledger' &&
            [
              'lot_rejected',
              'lot_approved',
              'lot_dispatched',
              'lot_assigned',
              'lot_updated',
              'lot_deleted',
              'bill_revision_approved',
              'bill_revision_rejected',
            ].includes(String(n.type || ''))
          ) {
            match = true;
          }
          if (category === 'bill_revision' && String(n.type || '') === 'bill_revision_request') match = true;
          if (
            category === 'payments' &&
            ['payment_recorded', 'payment_updated', 'payment_deleted'].includes(String(n.type || ''))
          ) {
            match = true;
          }

          if (match) {
            matchedCount++;
            return { ...n, readAt: now };
          }
          return n;
        })
      );

      if (matchedCount > 0) {
        setNotificationUnreadCount((c) => Math.max(0, c - matchedCount));
      }

      try {
        await apiService.markNotificationsReadByContext({ category, type, types, lotId });
      } catch (err) {
        console.warn('markNotificationsReadByContext failed', err);
      }
    },
    [isAuthenticated]
  );

  const clearPendingLotNotice = useCallback(() => setPendingLotNotice(null), []);

  useEffect(() => {
    if (!isAuthenticated || (userRole !== 'admin' && userRole !== 'party')) {
      setNotifications([]);
      setNotificationUnreadCount(0);
      setPartyMotivation(null);
      return undefined;
    }
    void refreshNotifications();
    if (userRole === 'party') {
      void refreshPartyMotivation();
    }
    return undefined;
  }, [isAuthenticated, userRole, refreshNotifications, refreshPartyMotivation]);

  return {
    notifications,
    setNotifications,
    notificationUnreadCount,
    setNotificationUnreadCount,
    pendingLotNotice,
    setPendingLotNotice,
    activeAnnouncement,
    setActiveAnnouncement,
    partyMotivation,
    setPartyMotivation,
    refreshNotifications,
    refreshPartyMotivation,
    markNotificationRead,
    markAllNotificationsRead,
    markNotificationsReadByContext,
    clearPendingLotNotice,
  };
}
