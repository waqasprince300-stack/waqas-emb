/** Strip noisy `HTTP 403: ...` wrapper from api.js errors for user-facing alerts. */
export function formatApiError(err, fallback = 'Something went wrong') {
  const msg = String(err?.message || '').trim();
  if (!msg) return fallback;
  const m = msg.match(/^HTTP \d+:\s*(.+)$/i);
  return m ? m[1].trim() : msg;
}
