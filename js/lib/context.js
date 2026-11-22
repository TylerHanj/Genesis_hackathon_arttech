/* =====================================================================
   Контекст дня — ТОЛЬКО по явному согласию (переключатели в форме).
   - город → координаты: Open-Meteo Geocoding;
   - «Определить»: геолокация браузера (спросит разрешение) → координаты ОКРУГЛЯЮТСЯ до 0,1° (~10 км)
     → название города: BigDataCloud (бесплатный клиентский сервис);
   - погода за дату: Open-Meteo (прогноз — для последних ~80 дней, архив — для более старых дат);
   - время съёмки: из EXIF JPEG читается только DateTimeOriginal, геометки (GPS) не читаются.
   Координаты никуда не сохраняются — в записи остаются только город и описание погоды.
   ===================================================================== */
import { parseLocalDate, todayLocal } from './util.js';

const round1 = x => Math.round(x * 10) / 10;
const okNum = (x, lo, hi) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;

async function getJSON(url) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; } finally { clearTimeout(tm); }
}

export async function geocodeCity(name, lang) {
  const q = String(name || '').trim().slice(0, 80);
  if (q.length < 2) return null;
  const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=${encodeURIComponent(lang)}&format=json`);
  const r = d && Array.isArray(d.results) && d.results[0];
  if (!r || !okNum(r.latitude, -90, 90) || !okNum(r.longitude, -180, 180)) return null;
  return { name: String(r.name || q).slice(0, 80), lat: round1(r.latitude), lon: round1(r.longitude) };
}

export function detectPosition() {
  return new Promise(ok => {
    if (!navigator.geolocation) { ok({ error: 'unsupported' }); return; }
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: round1(p.coords.latitude), lon: round1(p.coords.longitude) }),
      e => ok({ error: e && e.code === 1 ? 'denied' : 'failed' }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  });
}

export async function cityName(lat, lon, lang) {
  const d = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${round1(lat)}&longitude=${round1(lon)}&localityLanguage=${encodeURIComponent(lang)}`);
  if (!d || typeof d !== 'object') return null;
  const n = [d.city, d.locality, d.principalSubdivision].find(x => typeof x === 'string' && x.trim());
  return n ? n.trim().slice(0, 80) : null;
}

export function wmoKind(code) {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'clouds';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'clouds';
}

export async function weatherFor(lat, lon, date) {
  const d = parseLocalDate(date), today = parseLocalDate(todayLocal());
  if (!d || !okNum(lat, -90, 90) || !okNum(lon, -180, 180)) return null;
  const ago = Math.round((today - d) / 86400000);
  if (ago < -14) return null;                                              // далёкое будущее — погоды ещё нет
  const daily = 'daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto';
  const ll = `latitude=${round1(lat)}&longitude=${round1(lon)}`;
  /* последние ~90 дней и ближайшие 2 недели — прогнозный API (берём весь период и ищем нужный день),
     более старые даты — архив (данные появляются там с задержкой ~5 дней) */
  const url = ago > 85
    ? `https://archive-api.open-meteo.com/v1/archive?${ll}&start_date=${date}&end_date=${date}&${daily}`
    : `https://api.open-meteo.com/v1/forecast?${ll}&past_days=92&forecast_days=16&${daily}`;
  const r = await getJSON(url);
  const dl = r && r.daily;
  if (!dl || !Array.isArray(dl.weather_code) || !Array.isArray(dl.time)) return null;
  const i = dl.time.indexOf(date);
  if (i < 0 || !okNum(dl.weather_code[i], 0, 99)) return null;
  const tx = dl.temperature_2m_max && dl.temperature_2m_max[i], tn = dl.temperature_2m_min && dl.temperature_2m_min[i];
  const t = okNum(tx, -90, 70) && okNum(tn, -90, 70) ? Math.round((tx + tn) / 2) : null;
  return { code: dl.weather_code[i], kind: wmoKind(dl.weather_code[i]), ...(t != null ? { t } : {}) };
}

/* EXIF: только время съёмки. Возвращает { date: 'YYYY-MM-DD', hour } или null. */
export async function readExifTime(file) {
  try {
    const buf = await file.slice(0, 262144).arrayBuffer(), v = new DataView(buf), len = v.byteLength;
    if (len < 4 || v.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off + 4 <= len) {
      const marker = v.getUint16(off), size = v.getUint16(off + 2);
      if (marker === 0xFFDA || size < 2) break;
      if (marker === 0xFFE1 && off + 10 <= len && v.getUint32(off + 4) === 0x45786966) {     // "Exif"
        const tiff = off + 10, le = v.getUint16(tiff) === 0x4949;
        const u16 = o => v.getUint16(tiff + o, le), u32 = o => v.getUint32(tiff + o, le);
        const inside = o => tiff + o >= 0 && tiff + o + 2 <= len;
        const find = (ifd, tag) => {
          if (!inside(ifd)) return null;
          const n = u16(ifd);
          for (let i = 0; i < n && i < 200; i++) {
            const e = ifd + 2 + i * 12;
            if (!inside(e + 10)) return null;
            if (u16(e) === tag) return { type: u16(e + 2), count: u32(e + 4), val: e + 8 };
          }
          return null;
        };
        const ascii = ent => {
          if (!ent || ent.type !== 2 || ent.count < 19) return null;
          const p = ent.count > 4 ? u32(ent.val) : ent.val;
          if (!inside(p + 19)) return null;
          let s = ''; for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(tiff + p + i));
          return s;
        };
        const ifd0 = u32(4), exifPtr = find(ifd0, 0x8769);                // 0x8825 (GPS) намеренно не читаем
        const raw = (exifPtr && (ascii(find(u32(exifPtr.val), 0x9003)) || ascii(find(u32(exifPtr.val), 0x9004)))) || ascii(find(ifd0, 0x0132));
        const m = raw && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3], h = +m[4];
        if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23) return null;
        return { date: `${m[1]}-${m[2]}-${m[3]}`, hour: h, time: `${m[4]}:${m[5]}` };
      }
      off += 2 + size;
    }
  } catch (e) { /* повреждённый EXIF — просто нет времени */ }
  return null;
}
