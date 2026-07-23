// Shared image helpers for uploading slips / lot pictures as compressed base64 data URLs.
// Mirrors the proven Party Ledger bill-image pipeline so payloads stay under typical proxy limits.

/** Target max decoded size for a stored photo (JPEG). */
export const STORED_IMG_MAX_BYTES = 240 * 1024;

/** Read a picked file into a stored value: data URL for images/PDFs, filename otherwise. */
export function readFileAsStoredValue(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
      return;
    }
    resolve(file.name);
  });
}

function approxBytesFromDataUrl(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i === -1) return 0;
  const b64 = dataUrl.slice(i + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length * 3) / 4 - pad;
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = dataUrl;
  });
}

async function compressImageDataUrl(dataUrl, maxBytes = STORED_IMG_MAX_BYTES) {
  if (!dataUrl || !/^data:image\//i.test(dataUrl)) return dataUrl;

  let img;
  try {
    img = await dataUrlToImage(dataUrl);
  } catch {
    throw new Error('Could not read this image (try JPG/PNG or a smaller file).');
  }

  const mime = 'image/jpeg';
  let maxEdge = Math.min(1600, Math.max(img.width, img.height));
  let quality = 0.86;

  const encode = (edge, q) => {
    const long = Math.max(img.width, img.height);
    const scale = Math.min(1, edge / long);
    const tw = Math.max(1, Math.round(img.width * scale));
    const th = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL(mime, q);
  };

  let out = encode(maxEdge, quality);
  for (let i = 0; i < 22 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
    if (quality > 0.28) {
      quality -= 0.06;
      out = encode(maxEdge, quality);
    } else {
      maxEdge = Math.round(maxEdge * 0.82);
      if (maxEdge < 200) break;
      quality = 0.82;
      out = encode(maxEdge, quality);
    }
  }
  if (approxBytesFromDataUrl(out) > maxBytes) {
    maxEdge = 180;
    quality = 0.72;
    out = encode(maxEdge, quality);
    for (let i = 0; i < 8 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
      quality = Math.max(0.22, quality - 0.08);
      out = encode(maxEdge, quality);
    }
  }
  return out;
}

/** Compress images (leaves PDFs / filenames untouched) before storing. */
export async function finalizeStoredImage(stored) {
  if (!stored) return '';
  if (/^data:image\//i.test(String(stored))) return compressImageDataUrl(stored);
  return stored;
}

/** Pick a file, then return the compressed stored value ready to save. */
export async function fileToFinalizedImage(file) {
  const raw = await readFileAsStoredValue(file);
  return finalizeStoredImage(raw);
}
