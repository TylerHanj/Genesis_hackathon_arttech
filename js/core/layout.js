/* =====================================================================
   Раскладка карты воспоминаний (общая для карты и экрана категории).
   - daySector: сектор карты настроения дня — точка, которую поставил пользователь,
     а если её нет или она в центре — рассчитанная атмосфера дня (style.val / style.aro);
     сам выбор круга — makeSorter в sorter.js;
   - packCircle: аккуратная сетка до 6 карточек внутри круга без наложений + место для «+N»;
   - looseSpot: место для карточки без категории.
   ===================================================================== */
import { rng, hash, clamp } from '../lib/util.js';
import { isMood, sectorOf, analyze } from './analysis.js';

/* 8 секторов карты настроения → 8 стандартных кругов (5 прежних id сохранены, их записи не переезжают) */
export const SECTOR_CAT = { delight: 'c-collage', joy: 'c-joy', calmJoy: 'c-monet', calm: 'c-film', sad: 'c-minimal', gloom: 'c-gloom', anxiety: 'c-kandinsky', alert: 'c-alert' };
/* Без точки на карте: атмосфера дня (style.val/aro) + явные слова настроения в тексте («дедлайн», «грустно», «счастье»),
   которые тянут точку в свою сторону. A — готовый analyze(), если уже посчитан. */
const DOM_DIR = { joy: [1, 0], energy: [0, 1], tense: [-.7, .7], sad: [-.7, -.7], calm: [0, -1] };
export function daySector(d, A) {
  const m = d.mood;
  if (isMood(m) && Math.hypot(m.valence, m.energy) >= .25) return sectorOf(m.valence, m.energy);
  const st = d.style || {};
  let v = (isFinite(st.val) ? st.val : .5) * 2 - 1, e = (isFinite(st.aro) ? st.aro : .5) * 2 - 1;
  const a = A || analyze({ text: d.text, photos: d.photos || [], song: d.song, mood: null, date: d.date, ctx: d.ctx });
  const top = Object.entries(a.sc).sort((x, y) => y[1] - x[1])[0];
  if (top && top[1] > 0 && DOM_DIR[top[0]]) { v += .6 * top[1] * DOM_DIR[top[0]][0]; e += .6 * top[1] * DOM_DIR[top[0]][1]; }
  return Math.hypot(v, e) < .15 ? 'calm' : sectorOf(v, e);
}

export const PREVIEW_MAX = 6;
/* К какому кругу относится день — см. makeSorter в sorter.js (ручной перенос → свои круги → сектор настроения). */

/* Карточки без категории — в середине карты (в сетке 3×3 центр свободен; в старом кольце из 5 кругов — тоже). */
export function looseSpot(id) {
  const r = rng(hash(id));
  return { x: Math.round(-100 + r() * 200), y: Math.round(-70 + r() * 140) };
}

/* Новые сверху; при равной дате — порядок создания (id стабилен). */
export const byNewest = (a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id));

/* Сетка внутри круга: 1 → 1, 2 → 2, 3 → 3 в ряд, 4 → 2×2, 5 → 3+2, 6 → 3×2.
   Возвращает масштаб карточек s, центры карточек и точку для «+N». Проверено: всё помещается в круг. */
export function packCircle(c, n) {
  const k = Math.min(n, PREVIEW_MAX);
  if (!k) return { s: 1, pts: [], more: null };
  const cols = k <= 1 ? 1 : (k === 2 || k === 4) ? 2 : 3, rows = Math.ceil(k / cols);
  const s = clamp((c.r / 190) * (rows > 1 ? .72 : .9), .45, 1.1);
  const cw = 84 * s, ch = 176 * s, gx = 14 * s, gy = 12 * s;          // 176 = кадр 150 + подпись
  const totalH = rows * ch + (rows - 1) * gy, extra = n > k ? 14 * s : 0;
  const top = c.y - totalH / 2 - extra;
  const pts = [];
  for (let i = 0; i < k; i++) {
    const row = Math.floor(i / cols), inRow = row === rows - 1 ? k - row * cols : cols, col = i - row * cols;
    const rowW = inRow * cw + (inRow - 1) * gx;
    pts.push({ x: c.x - rowW / 2 + col * (cw + gx) + cw / 2, y: top + row * (ch + gy) + 75 * s });
  }
  return { s, pts, more: n > k ? { x: c.x, y: top + totalH + 16 * s } : null };
}
