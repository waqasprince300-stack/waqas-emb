function utf8ToB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

/** ~64k fragment size to stay within practical URL limits */
const CHUNK_LEN = 50000;

/**
 * Builds a shareable relative URL path+query+hash for a khata snapshot.
 * Returns { url, warning } warning set if clipboard-only fallback recommended.
 */
export function buildKhataShareUrl(snapshot) {
  const json = JSON.stringify(snapshot);
  const enc = utf8ToB64(json);
  const originPath = `${window.location.origin}/personal-khata/shared`;

  if (enc.length <= 48000) {
    return { url: `${originPath}#d=${encodeURIComponent(enc)}`, warning: null };
  }

  const chunks = [];
  for (let i = 0; i < enc.length; i += CHUNK_LEN) {
    chunks.push(enc.slice(i, i + CHUNK_LEN));
  }
  const qs = chunks.map((c, i) => `d${i}=${encodeURIComponent(c)}`).join('&');
  const len = qs.length + originPath.length + 2;
  if (len > 120000) {
    return {
      url: '',
      warning: 'snapshot_bloated',
    };
  }
  return { url: `${originPath}?${qs}`, warning: 'long_url' };
}

export function parseKhataShareFromLocation(location) {
  const hash = location?.hash ?? window.location.hash;
  const search = location?.search ?? window.location.search;

  try {
    if (hash && hash.startsWith('#d=')) {
      const raw = decodeURIComponent(hash.slice(3));
      return JSON.parse(b64ToUtf8(raw));
    }

    const params = new URLSearchParams(search || '');
    if (!params.toString()) return null;

    const keys = [...params.keys()]
      .filter((k) => /^d\d+$/i.test(k))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

    if (keys.length === 0) return null;

    const merged = keys.map((k) => decodeURIComponent(params.get(k) || '')).join('');
    return JSON.parse(b64ToUtf8(merged));
  } catch {
    return null;
  }
}
