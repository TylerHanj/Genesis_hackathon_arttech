/* =====================================================================
   Проверка данных, пришедших из базы, перед показом.
   Даже свои записи проверяются: значения попадают в CSS (цвета, url фото) и в плееры,
   а когда появятся публичные воспоминания (этап 3), это станет чужой ввод.
   Неизвестные поля отбрасываются (защита от prototype pollution и мусора).
   ===================================================================== */
import { TECHS, WEATHER_KINDS, ERAS } from '../core/analysis.js';
import { SCENE_TAGS } from '../core/vision.js';
import { KEYS } from '../core/audio.js';
import { parseTrackLink } from './links.js';

const COLOR = /^hsl\(\d{1,3}(?:\.\d+)? \d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%\)$/;
const PHOTO = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/;
const AN_SRC = ['audio', 'meta', 'preview', 'db'];
const COVER = /^https:\/\/is\d{1,2}-ssl\.mzstatic\.com\/image\/thumb\/[A-Za-z0-9/._-]{1,300}$/;

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const color = (v, d) => (typeof v === 'string' && COLOR.test(v) ? v : d);
const own = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);

export const safeColor = color;

export function sanitizeDay(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = str(raw.id, 100);
  if (!id || id.startsWith('meta:')) return null;
  const st = raw.style && typeof raw.style === 'object' ? raw.style : {};
  const photos = (Array.isArray(raw.photos) ? raw.photos : []).slice(0, 4)
    .filter(p => p && typeof p.url === 'string' && PHOTO.test(p.url))
    .map(p => {
      const o = { url: p.url, h: num(p.h, 0, 360, 30), s: num(p.s, 0, 1, .3), l: num(p.l, 0, 1, .5), warm: num(p.warm, -1, 1, 0) };
      if (Array.isArray(p.dom)) {                                             // новые фото: главные цвета, свет, примерный сюжет
        o.dom = p.dom.slice(0, 5).filter(x => Array.isArray(x) && HEX.test(x[0]) && isFinite(x[1])).map(x => [x[0], num(x[1], 0, 1, 0)]);
        o.lum = num(p.lum, 0, 1, .5); o.con = num(p.con, 0, 1, .3);
        o.tags = (Array.isArray(p.tags) ? p.tags : []).filter(x => SCENE_TAGS.includes(x)).slice(0, 6);
      }
      return o;
    });
  const sg = raw.song && typeof raw.song === 'object' ? raw.song : {};
  const link = str(sg.link, 2048);
  const song = {
    link: link && parseTrackLink(link) ? link : '',
    badLink: !!(link && !parseTrackLink(link)),
    artist: str(sg.artist, 120), genre: str(sg.genre, 40), year: str(sg.year, 12),
    bpm: num(sg.bpm, 40, 220, 118), mode: sg.mode === 'minor' ? 'minor' : 'major', energy: num(sg.energy, 0, 1, .6),
    fileName: str(sg.fileName, 120), start: Math.round(num(sg.start, 0, 36000, 0)),
    title: str(sg.title, 140),
    cover: typeof sg.cover === 'string' && COVER.test(sg.cover) ? sg.cover : '',
  };
  if (sg.an && typeof sg.an === 'object') {     // анализ: audio — свой файл, preview — фрагмент песни по ссылке, db — темп из Deezer, meta — по жанру
    song.an = { bpm: Math.round(num(sg.an.bpm, 40, 220, 118)), mode: sg.an.mode === 'minor' ? 'minor' : 'major', energy: num(sg.an.energy, 0, 1, .5),
      bright: num(sg.an.bright, 0, 1, .5), conf: num(sg.an.conf, 0, 1, 0), src: AN_SRC.includes(sg.an.src) ? sg.an.src : 'audio',
      ...(KEYS.includes(sg.an.key) && sg.an.mu !== true ? { key: sg.an.key } : {}), ...(sg.an.dz === true ? { dz: true } : {}), ...(sg.an.mu === true ? { mu: true } : {}) };
  }
  const v = st.voice && typeof st.voice === 'object' ? st.voice : {};
  const style = {
    tech: TECHS.includes(st.tech) ? st.tech : 'film',
    s1: color(st.s1, 'hsl(30 30% 84%)'), s2: color(st.s2, 'hsl(60 30% 76%)'), sa: color(st.sa, 'hsl(50 60% 48%)'), si: color(st.si, 'hsl(30 20% 15%)'),
    grain: num(st.grain, 0, 1, .2), sec: num(st.sec, 3, 7.5, 5), kspeed: num(st.kspeed, 5, 60, 30),
    aro: num(st.aro, 0, 1, .5), val: num(st.val, 0, 1, .5), dark: st.dark === true,
    voice: { rate: num(v.rate, .5, 2, 1), pitch: num(v.pitch, .5, 2, 1), key: ['warm', 'fast', 'low', 'even'].includes(v.key) ? v.key : undefined },
  };
  if (st.fx && typeof st.fx === 'object') {
    const fx = {};
    if (WEATHER_KINDS.includes(st.fx.weather)) fx.weather = st.fx.weather;
    if (ERAS.includes(st.fx.era)) fx.era = st.fx.era;
    if (fx.weather || fx.era) style.fx = fx;
  }
  const day = {
    id, date: DATE.test(raw.date) ? raw.date : '', text: str(raw.text, 20000), title: str(raw.title, 140) || '…',
    manualTitle: raw.manualTitle === true, photos, song, style,
  };
  const cx = raw.ctx;
  if (cx && typeof cx === 'object') {                                        // контекст дня (только по согласию; координат здесь нет)
    const c = {};
    if (typeof cx.place === 'string' && cx.place.trim()) c.place = str(cx.place.trim(), 80);
    if (cx.weather && WEATHER_KINDS.includes(cx.weather.kind)) c.weather = { kind: cx.weather.kind, code: Math.round(num(cx.weather.code, 0, 99, 0)), t: Math.round(num(cx.weather.t, -80, 60, 0)) };
    if (isFinite(cx.hour)) c.hour = Math.round(num(cx.hour, 0, 23, 12));
    if (c.place || c.weather || c.hour != null) day.ctx = c;
  }
  const md = raw.mood;
  if (md && typeof md === 'object' && isFinite(md.valence) && isFinite(md.energy)) day.mood = { valence: num(md.valence, -1, 1, 0), energy: num(md.energy, -1, 1, 0) };
  // устаревшее место на карте (теперь раскладка хранится отдельно, см. store.layout)
  if (typeof raw.cat === 'string' || raw.cat === null) day.cat = raw.cat === null ? null : str(raw.cat, 100);
  if (raw.pos && isFinite(raw.pos.x) && isFinite(raw.pos.y)) day.pos = { x: num(raw.pos.x, -1e5, 1e5, 0), y: num(raw.pos.y, -1e5, 1e5, 0) };
  return day;
}

export function sanitizeCats(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.slice(0, 40).filter(c => c && typeof c.id === 'string').map(c => ({
    id: str(c.id, 60), name: str(c.name, 60) || '…',
    x: num(c.x, -1e5, 1e5, 0), y: num(c.y, -1e5, 1e5, 0), r: num(c.r, 60, 600, 170),
    color: color(c.color, 'hsl(30 55% 55%)'),
  }));
}

/* Раскладка карты: { [dayId]: { x, y, cat } | { auto: true } } */
export function sanitizeLayout(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const k of Object.keys(obj).slice(0, 5000)) {
    const v = obj[k];
    if (!own(obj, k) || k === '__proto__' || k === 'constructor' || k === 'prototype' || !v || typeof v !== 'object') continue;
    if (v.auto === true) { out[k] = { auto: true }; continue; }
    if (!isFinite(v.x) || !isFinite(v.y)) continue;
    out[k] = { x: num(v.x, -1e5, 1e5, 0), y: num(v.y, -1e5, 1e5, 0), cat: typeof v.cat === 'string' ? v.cat.slice(0, 60) : null };
  }
  return out;
}
