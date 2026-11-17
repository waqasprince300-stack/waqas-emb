import { useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';

const PUBLIC_VAPID_KEY =
  (typeof process !== 'undefined' && process.env?.REACT_APP_VAPID_PUBLIC_KEY) ||
  'BAqcRBMh_MAzF9thiFb-PwhcpdZq22AdVkNDnR-Ci7CDiNpfiFXXHVBZQaer_1rgXQJxzmwWIH9UO9vmVj5xqNo';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications({ isAuthenticated = false, autoSyncIfGranted = true } = {}) {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [permission, setPermission] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check existing push subscription status
  const checkSubscription = useCallback(async () => {
    if (!isSupported) return false;
    try {
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      const active = Boolean(sub);
      setIsSubscribed(active);
      return active;
    } catch (e) {
      console.warn('[usePushNotifications] check error:', e);
      return false;
    }
  }, [isSupported]);

  // Request permission & subscribe to push notifications
  const subscribeToPush = useCallback(async () => {
    if (!isSupported) {
      const msg = 'Push notifications is browser par supported nahi hain.';
      setError(msg);
      throw new Error(msg);
    }

    setLoading(true);
    setError(null);

    try {
      // Ensure service worker is registered
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js');
      }
      await navigator.serviceWorker.ready;

      // Request browser permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setLoading(false);
        if (perm === 'denied') {
          const deniedErr = 'Notifications block hain. Browser k lock icon (🔒) se allow karein.';
          setError(deniedErr);
          throw new Error(deniedErr);
        }
        return { success: false, reason: 'dismissed' };
      }

      // Subscribe to PushManager
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
        });
      }

      // Send subscription object to backend API
      const subPayload = subscription.toJSON ? subscription.toJSON() : subscription;
      await apiService.subscribePushNotification(subPayload);

      setIsSubscribed(true);
      setLoading(false);
      return { success: true };
    } catch (err) {
      setLoading(false);
      const errMsg = err?.message || 'Push notification subscribe karne mein masla aaya.';
      setError(errMsg);
      throw err;
    }
  }, [isSupported]);

  // If user already granted permission, ensure backend has their active push token silently
  useEffect(() => {
    if (!isAuthenticated || !isSupported) return;

    checkSubscription().then(async () => {
      if (Notification.permission === 'granted' && autoSyncIfGranted) {
        try {
          const reg = await navigator.serviceWorker.ready;
          let sub = await reg.pushManager.getSubscription();
          if (!sub) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
            });
          }
          const payload = sub.toJSON ? sub.toJSON() : sub;
          await apiService.subscribePushNotification(payload);
          setIsSubscribed(true);
        } catch (e) {
          console.warn('[usePushNotifications] Auto-sync quiet error:', e);
        }
      }
    });
  }, [isAuthenticated, isSupported, autoSyncIfGranted, checkSubscription]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    subscribeToPush,
    checkSubscription,
  };
}

export default usePushNotifications;
