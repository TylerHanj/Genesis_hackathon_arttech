/* Доминирующие цвета фотографий дня → фон папки.
   Фото уменьшаются на canvas, пиксели складываются в корзины по цвету (с упором на насыщенные,
   чтобы серый фон/небо не перебивал), берутся самые «весомые» непохожие цвета.
   Цвета потом приводятся к тону дня (светлому/тёмному), чтобы текст оставался читаемым. */

const SIZE = 40;

function load(url) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/* Возвращает до n цветов [{h, s, w}] по убыванию «веса», либо [] если ничего не вышло. */
export async function dominantColors(urls, n = 3) {
  const bins = new Map();
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return [];
  for (const url of urls.slice(0, 4)) {
    const im = await load(url); if (!im) continue;
    cx.clearRect(0, 0, SIZE, SIZE);
    try { cx.drawImage(im, 0, 0, SIZE, SIZE); const px = cx.getImageData(0, 0, SIZE, SIZE).data; collect(px, bins); } catch (e) { /* canvas «загрязнён» чужим доменом */ }
  }
  const all = [...bins.values()].filter(b => b.w > 0).map(b => { const [h, s, l] = rgbToHsl(b.r / b.n, b.g / b.n, b.b / b.n); return { h, s, l, w: b.w }; });
  all.sort((a, b) => b.w - a.w);
  const out = [];
  for (const c of all) {
    if (out.every(o => hueGap(o.h, c.h) > 28 || Math.abs(o.l - c.l) > .3)) out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

function collect(px, bins) {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const [, s, l] = rgbToHsl(r, g, b);
    if (l < .06 || l > .96) continue;                             // почти чёрное/белое не красит фон
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const w = .25 + s * 1.5;                                        // насыщенным — больший вес
    const e = bins.get(key) || { r: 0, g: 0, b: 0, n: 0, w: 0 };
    e.r += r; e.g += g; e.b += b; e.n++; e.w += w; bins.set(key, e);
  }
}

/* Три цвета для градиента, подогнанные под тон дня: светлый день → пастель, тёмный → глубокие оттенки. */
export function toBackground(cols, dark) {
  if (!cols.length) return null;
  const list = [...cols]; while (list.length < 3) list.push({ ...list[list.length - 1], h: list[list.length - 1].h + 28 });
  const lv = dark ? [.2, .27, .16] : [.84, .78, .9];
  return list.slice(0, 3).map((c, i) => hsl(c.h, Math.min(dark ? .6 : .7, Math.max(.28, c.s)), lv[i]));
}

/* Перекрашивает цвет дня «hsl(h s% l%)» под тему сайта: тот же оттенок и насыщенность, другая светлота. */
export function retone(color, l) {
  const m = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(color);
  return m ? `hsl(${m[1]} ${m[2]}% ${l}%)` : color;
}
