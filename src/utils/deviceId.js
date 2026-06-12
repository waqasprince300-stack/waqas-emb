const DEVICE_ID_KEY = 'waqas_emb_device_id';

const randomId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

/** Stable per-browser device id used for new-device login OTP. Created once, then reused. */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

/** A short, human-friendly label for this device (browser + platform). */
export function getDeviceLabel() {
  try {
    const ua = navigator.userAgent || '';
    const browser = /Edg/.test(ua)
      ? 'Edge'
      : /Chrome/.test(ua)
        ? 'Chrome'
        : /Firefox/.test(ua)
          ? 'Firefox'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'Browser';
    const platform = navigator.platform || '';
    return [browser, platform].filter(Boolean).join(' · ').slice(0, 60);
  } catch {
    return 'Browser';
  }
}
