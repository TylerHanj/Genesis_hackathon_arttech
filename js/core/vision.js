/* =====================================================================
   Анализ фото без нейросетей (всё в браузере, по уменьшенной копии 48×48).
   - dom: до 5 главных цветов (k-means) с долями — вместо одного «среднего»;
   - lum / con: средняя яркость и контраст света;
   - tags: ПРИМЕРНЫЙ сюжет по цветовым зонам (небо, зелень, вода, снег, закат, темнота…).
     Это догадка по цветам, в интерфейсе подписывается «похоже на».
   ===================================================================== */

export function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const M = Math.max(r, g, b), m = Math.min(r, g, b), l = (M + m) / 2, d = M - m;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  return { h, s, l };
}
const hex = (r, g, b) => '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const dist = (a, b) => { const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db); };
const lumOf = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/* k-means с детерминированным стартом (по квантилям яркости) — одинаковый результат при каждом запуске */
function kmeans(px, k = 5, iters = 8) {
  const byL = [...px].sort((a, b) => lumOf(...a) - lumOf(...b));
  let cs = Array.from({ length: k }, (_, i) => [...byL[Math.min(byL.length - 1, Math.floor((i + .5) / k * byL.length))]]);
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < iters; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => {
      let best = 0, bd = Infinity;
      cs.forEach((c, j) => { const d = dist(p, c); if (d < bd) { bd = d; best = j; } });
      assign[i] = best; const s = sum[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    cs = cs.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  const counts = cs.map((_, j) => assign.filter(a => a === j).length);
  // слить почти одинаковые и убрать крошечные кластеры
  let out = cs.map((c, j) => ({ c, n: counts[j] })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const merged = [];
  out.forEach(x => { const m = merged.find(y => dist(y.c, x.c) < 40); if (m) { const t = m.n + x.n; m.c = m.c.map((v, i) => (v * m.n + x.c[i] * x.n) / t); m.n = t; } else merged.push({ ...x }); });
  const total = px.length;
  return merged.filter(x => x.n / total >= .03).sort((a, b) => b.n - a.n).slice(0, 5)
    .map(x => [hex(...x.c), Math.round(x.n / total * 100) / 100]);
}

/* data: RGBA (Uint8ClampedArray) размером w×h */
export function analyzePixels(data, w, h) {
  const px = [], L = [];
  let r0 = 0, g0 = 0, b0 = 0;
  const zone = { top: { n: 0, sky: 0, grey: 0, sunset: 0 }, bottom: { n: 0, water: 0 }, all: { green: 0, golden: 0, snow: 0 } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    px.push([r, g, b]); r0 += r; g0 += g; b0 += b;
    const l = lumOf(r, g, b); L.push(l);
    const { h: hu, s, l: hl } = rgb2hsl(r, g, b), chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;   // у почти белого HSL-насыщенность завышена — для белого/серого берём хрому
    if (y < h / 3) {
      zone.top.n++;
      if (hu >= 185 && hu <= 250 && s > .18 && hl > .35 && hl < .92) zone.top.sky++;
      if (chroma < .1 && hl > .55 && hl < .9) zone.top.grey++;
      if ((hu <= 40 || hu >= 330) && s > .4 && hl > .35 && hl < .8) zone.top.sunset++;
    }
    if (y >= h / 2) { zone.bottom.n++; if (hu >= 180 && hu <= 230 && s > .2 && hl > .2 && hl < .8) zone.bottom.water++; }
    if (hu >= 70 && hu <= 165 && s > .2 && hl > .12 && hl < .75) zone.all.green++;
    if (hu >= 18 && hu <= 52 && s > .4 && hl > .25 && hl < .78) zone.all.golden++;
    if (chroma < .08 && hl > .82) zone.all.snow++;
  }
  const n = px.length;
  const lum = L.reduce((a, b) => a + b, 0) / n;
  const con = Math.min(1, Math.sqrt(L.reduce((a, b) => a + (b - lum) * (b - lum), 0) / n) * 2.5);
  r0 /= n; g0 /= n; b0 /= n;
  const warm = (r0 - b0) / 255;
  const tags = [];
  const f = (a, d) => (d ? a / d : 0);
  if (f(zone.all.snow, n) > .3) tags.push('snow');
  if (f(zone.top.sky, zone.top.n) > .35) tags.push('sky');
  else if (f(zone.top.grey, zone.top.n) > .45 && !tags.includes('snow')) tags.push('overcast');
  if (f(zone.top.sunset, zone.top.n) > .3) tags.push('sunset');
  if (f(zone.all.green, n) > .2) tags.push('greenery');
  if (f(zone.all.golden, n) > .25) tags.push('golden');
  if (f(zone.bottom.water, zone.bottom.n) > .3) tags.push('water');
  if (lum < .2) tags.push('night');
  else if (lum < .38 && warm > .08) tags.push('warmDusk');
  return { ...rgb2hsl(r0, g0, b0), warm, dom: kmeans(px), lum: Math.round(lum * 100) / 100, con: Math.round(con * 100) / 100, tags: tags.slice(0, 5) };
}

/* «Характерный» цвет набора фото: доля × насыщенность (а не среднее, которое даёт грязные оттенки) */
export function characteristic(photos) {
  let best = null, bs = -1;
  photos.forEach(p => (p.dom || []).forEach(([c, share]) => {
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    const hs = rgb2hsl(r, g, b), sc = share * (.25 + hs.s) * (hs.l > .08 && hs.l < .95 ? 1 : .3);
    if (sc > bs) { bs = sc; best = hs; }
  }));
  return best;
}

export const SCENE_TAGS = ['sky', 'overcast', 'sunset', 'greenery', 'golden', 'water', 'snow', 'night', 'warmDusk'];
