/**
 * One-shot device contact pick via the Contact Picker API
 * (Chrome / Edge on Android — requires a secure context + user gesture).
 */

export function isContactPickerSupported() {
  try {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.contacts &&
      typeof navigator.contacts.select === 'function'
    );
  } catch {
    return false;
  }
}

/** Digits / + only; keep local formatting light. */
export function normalizePhoneDigits(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // Keep leading + and digits; drop spaces, dashes, parentheses.
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

/** Best-effort phone extract from pasted Contacts / WhatsApp text (iPhone-friendly). */
export function extractPhoneFromText(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  // Prefer an explicit +country… block, then a dense digit run (10–15).
  const plusMatch = text.match(/\+\d[\d\s().-]{7,}\d/);
  if (plusMatch) {
    const n = normalizePhoneDigits(plusMatch[0]);
    if (n.replace(/\D/g, '').length >= 10) return n;
  }

  const localMatch = text.match(/(?:\b0|\b03|\b92)?[\d\s().-]{9,}\d/);
  if (localMatch) {
    const n = normalizePhoneDigits(localMatch[0]);
    const digits = n.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return n;
  }

  // Whole clipboard is already just a number.
  const whole = normalizePhoneDigits(text);
  const wholeDigits = whole.replace(/\D/g, '');
  if (wholeDigits.length >= 10 && wholeDigits.length <= 15) return whole;

  return '';
}

/**
 * Read clipboard after a user tap (works on iOS Safari with permission / paste sheet).
 * @returns {Promise<string>} normalized phone or ''
 */
export async function readPhoneFromClipboard() {
  if (!navigator.clipboard?.readText) {
    const err = new Error('Clipboard paste is not available here.');
    err.code = 'UNSUPPORTED';
    throw err;
  }
  const text = await navigator.clipboard.readText();
  const phone = extractPhoneFromText(text);
  if (!phone) {
    const err = new Error(
      'No phone number found in clipboard. In Contacts: open the person → Copy phone number, then tap Paste here.',
    );
    err.code = 'EMPTY';
    throw err;
  }
  return phone;
}

/**
 * Opens the system contact picker.
 * @returns {Promise<null | { name: string, phones: string[] }>}
 *   null = user dismissed / selected nothing
 */
export async function pickDeviceContact() {
  if (!isContactPickerSupported()) {
    const err = new Error('Contact picker is not available on this device/browser.');
    err.code = 'UNSUPPORTED';
    throw err;
  }

  let props = ['name', 'tel'];
  try {
    if (typeof navigator.contacts.getProperties === 'function') {
      const available = await navigator.contacts.getProperties();
      if (Array.isArray(available) && available.length) {
        props = props.filter((p) => available.includes(p));
      }
    }
  } catch {
    // Keep defaults — select() will still work on most Chrome Android builds.
  }

  if (!props.length) {
    const err = new Error('Contact picker has no usable fields.');
    err.code = 'UNSUPPORTED';
    throw err;
  }

  let selected;
  try {
    selected = await navigator.contacts.select(props, { multiple: false });
  } catch (e) {
    // User cancelled / dismissed — treat as soft cancel, not an error toast.
    if (e?.name === 'AbortError' || e?.name === 'NotAllowedError') {
      return null;
    }
    throw e;
  }

  if (!Array.isArray(selected) || !selected.length) return null;

  const c = selected[0] || {};
  const nameRaw = Array.isArray(c.name) ? c.name[0] : c.name;
  const name = String(nameRaw || '').trim();
  const telList = Array.isArray(c.tel) ? c.tel : c.tel ? [c.tel] : [];
  const phones = [
    ...new Set(
      telList
        .map((t) => normalizePhoneDigits(t))
        .filter(Boolean),
    ),
  ];

  return { name, phones };
}
