import { getRegistrationEmailError } from './registrationEmail';

/** Normalize phone for API: digits only, optional leading + for country code */
export function normalizePkPhone(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

export function validatePersonalKhataPhone(raw) {
  const n = normalizePkPhone(raw).replace(/^\+/, '');
  if (!n) return 'Enter your mobile number.';
  if (n.length < 10) return 'Phone number looks too short (use at least 10 digits).';
  if (n.length > 15) return 'Phone number looks too long.';
  return '';
}

export function validatePersonalKhataIdentifier(method, email, phone) {
  if (method === 'email') {
    const e = getRegistrationEmailError(email);
    return e || '';
  }
  return validatePersonalKhataPhone(phone);
}

/**
 * @param {'email'|'phone'} method
 * @returns {{ email: string, phone: string }}
 */
export function identifiersForPersonalKhataSignup(method, email, phone) {
  if (method === 'email') {
    return {
      email: String(email || '')
        .trim()
        .toLowerCase(),
      phone: '',
    };
  }
  return {
    email: '',
    phone: normalizePkPhone(phone),
  };
}
