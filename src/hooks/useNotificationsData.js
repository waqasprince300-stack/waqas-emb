import { useState, useCallback, useEffect } from 'react';
import { apiService } from '../services/api';

export function useNotificationsData({ isAuthenticated, userRole }) {
  const [notifications, setNotifications] = useState([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [pendingLotNotice, setPendingLotNotice] = useState(null);

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    if (userRole !== 'admin' && userRole !== 'party') return;
    try {
      const [list, countRes] = await Promise.all([
        apiService.getNotifications(),
        apiService.getNotificationUnreadCount(),
      ]);
      setNotifications(Array.isArray(list) ? list : []);
      setNotificationUnreadCount(Number(countRes?.count) || 0);
    } catch (err) {
      console.warn('Notifications refresh failed', err);
    }
  }, [isAuthenticated, userRole]);

  const markNotificationRead = useCallback(async (id) => {
    if (!id) return;
    try {
      const updated = await apiService.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          String(n.id || n._id) === String(id)
            ? { ...n, ...updated, readAt: updated.readAt || new Date().toISOString() }
            : n
        )
      );
      setNotificationUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.warn('Mark notification read failed', err);
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await apiService.markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      setNotificationUnreadCount(0);
    } catch (err) {
      console.warn('Mark all notifications read failed', err);
    }
  }, []);

  const clearPendingLotNotice = useCallback(() => setPendingLotNotice(null), []);

  useEffect(() => {
    if (!isAuthenticated || (userRole !== 'admin' && userRole !== 'party')) {
      setNotifications([]);
      setNotificationUnreadCount(0);
      return undefined;
    }
    void refreshNotifications();
    return undefined;
  }, [isAuthenticated, userRole, refreshNotifications]);

  return {
    notifications,
    setNotifications,
    notificationUnreadCount,
    setNotificationUnreadCount,
    pendingLotNotice,
    setPendingLotNotice,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearPendingLotNotice,
  };
}
