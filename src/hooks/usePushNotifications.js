import { useEffect, useCallback } from 'react';
import apiService from '../services/api';

const PUBLIC_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "BAqcRBMh_MAzF9thiFb-PwhcpdZq22AdVkNDnR-Ci7CDiNpfiFXXHVBZQaer_1rgXQJxzmwWIH9UO9vmVj5xqNo";

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

export function usePushNotifications({ isAuthenticated }) {
  const subscribeToPush = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Request permission if not already granted
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
        });
      }

      // Send to backend
      await apiService.request('/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
      });
      console.log('Push notification subscribed successfully.');
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      subscribeToPush();
    }
  }, [isAuthenticated, subscribeToPush]);

  return { subscribeToPush };
}
