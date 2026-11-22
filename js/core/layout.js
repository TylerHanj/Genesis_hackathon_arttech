/* =====================================================================
   Раскладка карты воспоминаний (общая для карты и экрана категории).
   - catOf: к какой категории относится день (раскладка пользователя → старое поле day.cat → настроение).
     Настроение = один из 8 секторов карты настроения: точка, которую поставил пользователь,
     а если её нет или она в центре — рассчитанная атмосфера дня (style.val / style.aro);
   - packCircle: аккуратная сетка до 6 карточек внутри круга без наложений + место для «+N»;
   - looseSpot: место для карточки без категории.
   ===================================================================== */
import { rng, hash, clamp } from '../lib/util.js';
import { isMood, sectorOf } from './analysis.js';

/* 8 секторов карты настроения → 8 стандартных кругов (5 прежних id сохранены, их записи не переезжают) */
export const SECTOR_CAT = { delight: 'c-collage', joy: 'c-joy', calmJoy: 'c-monet', calm: 'c-film', sad: 'c-minimal', gloom: 'c-gloom', anxiety: 'c-kandinsky', alert: 'c-alert' };
export function daySector(d) {
  const m = d.mood;
  if (isMood(m) && Math.hypot(m.valence, m.energy) >= .25) return sectorOf(m.valence, m.energy);
  const st = d.style || {};
  const v = (isFinite(st.val) ? st.val : .5) * 2 - 1, e = (isFinite(st.aro) ? st.aro : .5) * 2 - 1;
  return Math.hypot(v, e) < .15 ? 'calm' : sectorOf(v, e);
}

export const PREVIEW_MAX = 6;

export function catOf(d, cats, layout) {
  const e = layout[d.id];
  if (e && !e.auto) return e.cat;
  if (!e && d.cat !== undefined) return d.cat;                     // записи старого формата
  const want = SECTOR_CAT[daySector(d)];
  if (cats.some(c => c.id === want)) return want;
  return cats.some(c => c.id === 'c-' + d.style.tech) ? 'c-' + d.style.tech : null;   // круг удалён — прежнее правило по приёму
}

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
