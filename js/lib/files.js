/* =====================================================================
   Проверка файлов до чтения: белый список типов, РЕАЛЬНАЯ сигнатура (первые байты), размер.
   SVG/HTML как изображения не принимаются. Фото потом перекодируются через canvas в JPEG —
   это удаляет EXIF (в т.ч. геолокацию) и любые встроенные данные.
   ===================================================================== */
import { analyzePixels } from '../core/vision.js';

export const LIMITS = Object.freeze({ photos: 4, photoMB: 15, audioMB: 25, maxSide: 900 });

const startsWith = (b, sig, off = 0) => sig.every((x, i) => x === null || b[off + i] === x);
const ascii = (b, s, off) => startsWith(b, [...s].map(c => c.charCodeAt(0)), off);

export function sniffImage(b) {
  if (startsWith(b, [0xFF, 0xD8, 0xFF])) return 'image/jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png';
  if (ascii(b, 'GIF87a', 0) || ascii(b, 'GIF89a', 0)) return 'image/gif';
  if (ascii(b, 'RIFF', 0) && ascii(b, 'WEBP', 8)) return 'image/webp';
  return null;
}
export function sniffAudio(b) {
  if (ascii(b, 'ID3', 0)) return 'audio/mpeg';
  if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return 'audio/mpeg';         // кадр MPEG без ID3
  if (ascii(b, 'OggS', 0)) return 'audio/ogg';
  if (ascii(b, 'ftyp', 4)) return 'audio/mp4';                               // M4A / AAC в MP4
  return null;
}
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AUDIO_MIME = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', ''];

async function head(file, n = 16) { return new Uint8Array(await file.slice(0, n).arrayBuffer()); }

/* → { ok: true } или { ok: false, code: 'type'|'size', name, mb } */
export async function checkImage(file) {
  const name = String(file.name || '').slice(0, 80);
  if (file.size > LIMITS.photoMB * 1024 * 1024) return { ok: false, code: 'size', name, mb: LIMITS.photoMB };
  if (!IMAGE_MIME.includes(file.type)) return { ok: false, code: 'type', name };
  const real = sniffImage(await head(file));
  if (!real) return { ok: false, code: 'type', name };
  return { ok: true, mime: real };
}
export async function checkAudio(file) {
  const name = String(file.name || '').slice(0, 80);
  if (file.size > LIMITS.audioMB * 1024 * 1024) return { ok: false, code: 'size', name, mb: LIMITS.audioMB };
  if (!AUDIO_MIME.includes(file.type)) return { ok: false, code: 'type', name };
  const real = sniffAudio(await head(file));
  if (!real) return { ok: false, code: 'type', name };
  return { ok: true, mime: real };
}

/* Картинка (File или data:/blob: URL) → JPEG ≤ 900 px + главные цвета, свет и примерный сюжет. */
export function prepImage(src, max = LIMITS.maxSide) {
  return new Promise((ok, no) => {
    const isFile = src instanceof Blob, url = isFile ? URL.createObjectURL(src) : src;
    const done = () => { if (isFile) URL.revokeObjectURL(url); };
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      try {
        const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        let st = { h: 30, s: .3, l: .5, warm: 0 };
        try {                                   // цвета, свет и примерный сюжет — по копии 48×48 (js/core/vision.js)
          const t = document.createElement('canvas'); t.width = t.height = 48;
          const y = t.getContext('2d'); y.drawImage(im, 0, 0, 48, 48);
          st = analyzePixels(y.getImageData(0, 0, 48, 48).data, 48, 48);
        } catch (e) { /* остаётся нейтральный цвет */ }
        done(); ok({ url: c.toDataURL('image/jpeg', .72), ...st });
      } catch (e) { done(); no(e); }
    };
    im.onerror = e => { done(); no(e); };
    im.src = url;
  });
}

/* Энергия трека по громкости (RMS). Файл уже проверен checkAudio. */
export async function audioEnergy(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const d = buf.getChannelData(0); let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 50) { s += d[i] * d[i]; n++; }
    return Math.max(0, Math.min(1, Math.sqrt(s / n) * 3.2));
  } finally { ctx.close(); }
}
