/** Parse lot numbers like L-10, L-009, 101 — trailing digits = serial part. */
export function parseLotSerial(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) {
    return { prefix: trimmed, num: null, pad: 0, raw: trimmed };
  }
  const prefix = match[1];
  const numStr = match[2];
  return {
    prefix,
    num: parseInt(numStr, 10),
    pad: numStr.length,
    raw: trimmed,
  };
}

export function formatLotSerial(prefix, num, pad) {
  const n = pad > 0 ? String(num).padStart(pad, '0') : String(num);
  return `${prefix}${n}`;
}

/**
 * Build serial lot numbers from a starting value.
 * @returns {string[] | null} null when start has no trailing digits and count > 1
 */
export function generateSerialLotNumbers(startLot, count) {
  const n = Math.max(1, Math.min(100, Number(count) || 1));
  const start = String(startLot || '').trim();
  if (!start) return null;

  const parsed = parseLotSerial(start);
  if (!parsed || parsed.num == null) {
    return n === 1 ? [start] : null;
  }

  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(formatLotSerial(parsed.prefix, parsed.num + i, parsed.pad));
  }
  return out;
}

/** Short preview for UI: "L-10, L-11, L-12 … (+2 more)" */
export function previewSerialLotNumbers(numbers, maxShown = 5) {
  if (!Array.isArray(numbers) || numbers.length === 0) return '';
  if (numbers.length <= maxShown) return numbers.join(', ');
  const head = numbers.slice(0, maxShown).join(', ');
  return `${head} … (+${numbers.length - maxShown} more)`;
}
