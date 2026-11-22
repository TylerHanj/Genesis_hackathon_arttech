/* =====================================================================
   Анализ звука (в браузере, без внешних сервисов): свой аудиофайл или 30-секундный фрагмент песни.
   Версия 2 — переписано, потому что темп и лад определялись плохо.
   - Подготовка: смесь каналов → 11 025 Гц с фильтром от наложения частот.
   - Темп: огибающая атак по «спектральному потоку» в 40 полосах (лог-шкала; сравнение с максимумом соседних
     полос двумя кадрами раньше — меньше ложных атак от вибрато) → обобщённая автокорреляция (|БПФ|^0,5)
     → «гребёнка» кратных периодов + мягкое предпочтение ~120 BPM → проверка «вдвое быстрее/медленнее»
     по самому ритму (сильные ли доли между ударами).
   - Тональность и лад: длинное окно (0,74 с) → гармоническая часть (медиана по времени убирает барабаны)
     → пики спектра с уточнением частоты → строй записи (не обязательно A = 440 Гц)
     → подавление обертонов (3-я гармоника даёт ложную квинту, 5-я — ложную большую терцию, из-за чего
     минор путался с мажором) → хрома верхних голосов и отдельно баса
     → профили тональностей + бас (тоника) + аккорды (какие трезвучия звучат и какую роль играют в тональности).
   - Энергия: темп, громкость, плотность атак, яркость, лад (estimateEnergy).
   Чистые функции: работают и в браузере, и в Node (для проверки).
   ===================================================================== */

export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const R = 11025;                                          // рабочая частота для тональности
const RA = 22050;                                         // для атак: тарелки и хай-хэт звучат выше 5 кГц
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const r2 = x => Math.round(x * 100) / 100;

function fft(re, im) {                                    // БПФ на месте, длина — степень двойки
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/* Понижение частоты дискретизации: оконный sinc-фильтр (Блэкман) + выборка с линейной интерполяцией. */
function resample(src, sr, to = R) {
  if (Math.abs(sr - to) < 1) return Float32Array.from(src);
  const ratio = sr / to, fc = .45 / ratio, M = Math.ceil(4 * ratio), L = 2 * M + 1, h = new Float32Array(L);
  for (let k = 0; k < L; k++) {
    const x = k - M, s = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    h[k] = s * (.42 - .5 * Math.cos(2 * Math.PI * k / (L - 1)) + .08 * Math.cos(4 * Math.PI * k / (L - 1)));
  }
  const n = Math.floor(src.length / ratio), out = new Float32Array(n), last = src.length - 1;
  for (let i = 0; i < n; i++) {
    const p = i * ratio, c = Math.floor(p), fr = p - c;
    let a = 0, b = 0;
    for (let k = 0; k < L; k++) {
      const j = c - M + k;
      if (j >= 0 && j <= last) { a += h[k] * src[j]; if (j + 1 <= last) b += h[k] * src[j + 1]; }
    }
    out[i] = a + fr * (b - a);
  }
  return out;
}

/* Модули спектра кадров (окно Ханна). from..to — какие бины хранить. */
function stft(x, N, hop, from, to) {
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
  const frames = Math.max(0, Math.floor((x.length - N) / hop) + 1), re = new Float64Array(N), im = new Float64Array(N), out = [];
  for (let t = 0; t < frames; t++) {
    const s0 = t * hop;
    for (let i = 0; i < N; i++) { re[i] = x[s0 + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const m = new Float32Array(to - from);
    const g = 4 / N;
    for (let k = from; k < to; k++) m[k - from] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * g;
    out.push(m);
  }
  return out;
}

/* ---------------- темп ---------------- */
const HOP_A = 256, N_A = 1024, HOP_SEC = HOP_A / RA, F_TOP = 10000;

function onsetEnvelope(x) {
  const kmax = Math.floor(F_TOP * N_A / RA), S = stft(x, N_A, HOP_A, 0, kmax), T = S.length;
  const NB = 40, edges = [];
  for (let b = 0; b <= NB; b++) edges.push(Math.max(1, Math.round(30 * Math.pow(F_TOP / 30, b / NB) * N_A / RA)));
  const L = S.map(m => {
    const v = new Float32Array(NB);
    for (let b = 0; b < NB; b++) { let s = 0; const hi = Math.max(edges[b] + 1, edges[b + 1]); for (let k = edges[b]; k < hi && k < kmax; k++) s += m[k]; v[b] = Math.log1p(1000 * s); }
    return v;
  });
  // поток по полосам; каждая полоса нормируется на свою среднюю — бочка (низ), малый барабан (середина)
  // и хай-хэт (верх) весят одинаково, иначе широкий по спектру малый барабан «перекрикивает» бочку
  const fb = L.map(() => new Float32Array(NB)), mb = new Float64Array(NB);
  for (let t = 2; t < T; t++) {
    const a = L[t], p = L[t - 2];
    for (let b = 0; b < NB; b++) { const ref = Math.max(p[b], b ? p[b - 1] : 0, b < NB - 1 ? p[b + 1] : 0); const v = a[b] > ref ? a[b] - ref : 0; fb[t][b] = v; mb[b] += v; }
  }
  let gm = 0; for (let b = 0; b < NB; b++) { mb[b] /= Math.max(1, T); gm += mb[b] / NB; }
  const flux = new Float32Array(T);
  for (let t = 2; t < T; t++) { let s = 0; for (let b = 0; b < NB; b++) s += fb[t][b] / (mb[b] + .25 * gm + 1e-9); flux[t] = Math.sqrt(s / NB); }   // корень — удары разной силы ближе друг к другу
  // убрать медленный тренд (средняя за ±0,25 с), отрицательное — в ноль
  const w = Math.round(.25 / HOP_SEC), on = new Float32Array(T), cs = new Float64Array(T + 1);
  for (let t = 0; t < T; t++) cs[t + 1] = cs[t] + flux[t];
  for (let t = 0; t < T; t++) { const a = Math.max(0, t - w), b = Math.min(T, t + w + 1); on[t] = Math.max(0, flux[t] - (cs[b] - cs[a]) / (b - a)); }
  // яркость звука — спектральный центроид
  let fs = 0, ms = 0;
  const kc = Math.floor(5500 * N_A / RA);                 // центроид — как раньше, до 5,5 кГц (шкала яркости не меняется)
  for (const m of S) for (let k = 1; k < kc; k++) { fs += m[k] * k * RA / N_A; ms += m[k]; }
  return { on, centroid: ms > 1e-9 ? fs / ms : 1500, act: gm };   // act — средняя сила изменений спектра (0 у тишины и ровного тона)
}

/* Обобщённая автокорреляция: обратное БПФ от |спектра|^0,5 — пики острее, чем у обычной */
function gac(on) {
  let P = 1; while (P < 2 * on.length) P <<= 1;
  const re = new Float64Array(P), im = new Float64Array(P);
  let mean = 0; for (let i = 0; i < on.length; i++) mean += on[i]; mean /= on.length || 1;
  for (let i = 0; i < on.length; i++) re[i] = on[i] - mean;
  fft(re, im);
  for (let k = 0; k < P; k++) { re[k] = Math.pow(re[k] * re[k] + im[k] * im[k], .25); im[k] = 0; }
  fft(re, im);                                             // спектр вещественный и симметричный — прямое БПФ = обратное × P
  const r0 = re[0] || 1, r = new Float32Array(on.length);
  for (let i = 0; i < on.length; i++) r[i] = re[i] / r0;
  return r;
}
const at = (a, x) => { const i = Math.floor(x), f = x - i; return i + 1 < a.length ? a[i] * (1 - f) + a[i + 1] * f : 0; };
/* «Пульс»: насколько удары ложатся на сетку с периодом p (лучшая фаза) — и что между ударами */
function pulse(on, p) {
  let best = 0, off = 0;
  const steps = Math.max(1, Math.round(p));
  for (let s = 0; s < steps; s++) {
    let a = 0, b = 0, n = 0;
    for (let x = s; x + p / 2 < on.length; x += p) { a += Math.max(on[Math.round(x)], on[Math.round(x) + 1] || 0, on[Math.round(x) - 1] || 0); b += Math.max(at(on, x + p / 2), at(on, x + p / 2 + 1), at(on, x + p / 2 - 1)); n++; }
    if (n && a / n > best) { best = a / n; off = b / n; }
  }
  return { on: best, off };
}

/* Средняя обобщённая автокорреляция по окнам ~10 с с перекрытием (как темпограмма): устойчивее к вступлениям,
   паузам и выбору куска песни */
function gacAvg(on) {
  const W = Math.round(10 / HOP_SEC), step = Math.round(W / 2);
  if (on.length <= W * 1.3) return gac(on);
  const acc = new Float32Array(W); let n = 0;
  for (let s0 = 0; s0 + W <= on.length; s0 += step) { const r = gac(on.subarray(s0, s0 + W)); for (let i = 0; i < W; i++) acc[i] += r[i]; n++; }
  for (let i = 0; i < W; i++) acc[i] /= n;
  return acc;
}

function tempoOf(on) {
  const T = on.length;
  if (T < 200) return { bpm: 0, conf: 0 };
  const r = gacAvg(on);
  const lagOf = bpm => 60 / (bpm * HOP_SEC);
  const minL = lagOf(220), maxL = lagOf(45);
  const score = l => Math.max(0, at(r, l)) + .5 * Math.max(0, at(r, 2 * l)) + .25 * Math.max(0, at(r, 3 * l));
  const prior = bpm => Math.exp(-.5 * Math.pow(Math.log2(bpm / 120) / 1, 2));
  let best = 0, bestS = -1;
  for (let l = Math.floor(minL); l <= Math.ceil(maxL); l += .25) {
    const s = score(l) * prior(60 / (l * HOP_SEC));
    if (s > bestS) { bestS = s; best = l; }
  }
  // уточнить период: пики на 1, 2, 3, 4 периодах по автокорреляции всего фрагмента (параболой);
  // на длинных лагах относительная ошибка шага сетки меньше
  const rf = gac(on), peakNear = c => {
    let li = Math.round(c);
    for (let d = -2; d <= 2; d++) if ((rf[Math.round(c) + d] || -1) > (rf[li] || -1)) li = Math.round(c) + d;
    const y0 = rf[li - 1] || 0, y1 = rf[li] || 0, y2 = rf[li + 1] || 0, den = y0 - 2 * y1 + y2;
    return { pos: den < 0 ? li + clamp(.5 * (y0 - y2) / den, -.5, .5) : li, h: y1 };
  };
  let sw = 0, sp = 0;
  for (let k = 1; k <= 4; k++) { if (k * best >= rf.length - 2) break; const pk = peakNear(k * best); if (pk.h > 0) { sw += pk.h * k; sp += pk.h * pk.pos; } }
  let lag = sw > 0 ? sp / sw : best;
  if (Math.abs(lag - best) > 1.5) lag = best;
  let bpm = 60 / (lag * HOP_SEC);
  // уровень доли: если ровно посередине между найденными ударами тоже стабильно есть удары (бочка — малый барабан),
  // настоящая доля вдвое быстрее; если между ударами пусто и темп очень высокий — вдвое медленнее
  const p = pulse(on, lag);
  if (p.on > 0 && ((bpm < 100 && p.off / p.on >= .5) || (bpm < 62 && p.off / p.on >= .2))) bpm *= 2;   // песни медленнее ~60 BPM редки
  else if (bpm > 165) { const p2 = pulse(on, 2 * lag); if (p2.on > 0 && p2.off / p2.on < .3) bpm /= 2; }
  const conf = clamp(at(r, lag) * 1.6);
  if (conf < .015) return { bpm: 0, conf };               // повторяющегося ритма нет (например, шум) — темп не выдумываем
  return { bpm: Math.round(bpm), conf };
}

/* ---------------- тональность ---------------- */
const N_B = 8192, HOP_B = 1024, F_LO = 38, F_HI = 2100;
const K_LO = Math.floor(F_LO * N_B / R), K_HI = Math.ceil(F_HI * N_B / R);

/* Медианный фильтр по времени: остаётся гармоническая (тянущаяся) часть, удары барабанов уходят */
function harmonic(S, w = 4) {
  const T = S.length, K = T ? S[0].length : 0, out = S.map(() => new Float32Array(K)), buf = new Float32Array(2 * w + 1);
  for (let k = 0; k < K; k++) {
    for (let t = 0; t < T; t++) {
      let n = 0;
      for (let u = Math.max(0, t - w); u <= Math.min(T - 1, t + w); u++) buf[n++] = S[u][k];
      const a = buf.subarray(0, n).sort();
      out[t][k] = a[n >> 1];
    }
  }
  return out;
}

/* Пики кадра: локальные максимумы выше сглаженной огибающей, частота уточняется параболой */
function peaksOf(m) {
  const K = m.length, cs = new Float64Array(K + 1);
  for (let k = 0; k < K; k++) cs[k + 1] = cs[k] + m[k];
  const pk = [];
  for (let k = 2; k < K - 2; k++) {
    const v = m[k];
    if (v <= m[k - 1] || v < m[k + 1] || v <= m[k - 2] || v < m[k + 2]) continue;
    const kk = k + K_LO, half = Math.max(3, Math.round(kk * .12)), a = Math.max(0, k - half), b = Math.min(K, k + half + 1);
    const env = (cs[b] - cs[a]) / (b - a);
    if (v < 1.6 * env || v < 1e-5) continue;
    const l0 = Math.log(m[k - 1] + 1e-12), l1 = Math.log(v + 1e-12), l2 = Math.log(m[k + 1] + 1e-12), d = l0 - 2 * l1 + l2;
    const dk = d < 0 ? clamp(.5 * (l0 - l2) / d, -.5, .5) : 0;
    pk.push({ f: (kk + dk) * R / N_B, a: v });
  }
  return pk.sort((p, q) => q.a - p.a).slice(0, 40);
}

const MIDI = f => 69 + 12 * Math.log2(f / 440);
/* Ослабить пики, которые объясняются как обертоны более низких нот (3, 5, 6, 7-я гармоники) */
function suppressOvertones(pk) {
  const w = pk.map(() => 1), mid = pk.map(p => MIDI(p.f));
  for (let i = 0; i < pk.length; i++) {
    for (let j = 0; j < pk.length; j++) {
      if (pk[j].f >= pk[i].f) continue;
      for (const [h, keep] of [[3, .35], [5, .25], [6, .45], [7, .4]]) {
        if (Math.abs(mid[i] - mid[j] - 12 * Math.log2(h)) < .3 && pk[j].a * 1.5 > pk[i].a) { w[i] = Math.min(w[i], keep); break; }
      }
    }
  }
  return w;
}

/* Профили тональностей (вес каждой ступени): Sha'ath (KeyFinder, 2011) — получены по хроме реальных записей,
   поэтому лучше «книжных» профилей различают мажор и параллельный минор на аудио (проверено на тестовых наборах) */
const PROF = {
  major: [6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.4],
  minor: [6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 5.2, 4.0, 2.7, 4.3, 3.2],
};
/* Бас чаще всего играет тонику, затем доминанту и субдоминанту */
const BASS = {
  major: [1.0, 0, .25, 0, .3, .55, 0, .75, 0, .35, .15, .1],
  minor: [1.0, 0, .2, .35, 0, .55, 0, .75, .4, 0, .35, .1],
};
/* Роль трезвучия в тональности: [интервал корня от тоники, 'M'|'m', вес].
   Веса симметричны для параллельных тональностей (до мажор ↔ ля минор): общие аккорды (F, G, Dm, Em) весят одинаково,
   поэтому решают только «какой из тонических аккордов звучит больше» (C или Am) и характерные аккорды
   (E мажор с повышенной VII ступенью — признак минора; B♭ мажор — миксолидийский мажор). */
const FUNC = {
  major: [[0, 'M', 1], [5, 'M', .75], [7, 'M', .75], [9, 'm', .6], [2, 'm', .55], [4, 'm', .45], [10, 'M', .35], [5, 'm', .15]],
  minor: [[0, 'm', 1], [8, 'M', .75], [10, 'M', .75], [3, 'M', .6], [5, 'm', .55], [7, 'm', .45], [7, 'M', .7], [2, 'm', .1]],
};
const corr = (a, b) => {
  const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let s = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? s / Math.sqrt(da * db) : 0;
};
const rot = (v, k) => v.map((_, i) => v[(i - k + 12) % 12]);       // профиль для тоники k

function keyOf(x) {
  const S = stft(x, N_B, HOP_B, K_LO, K_HI);
  if (S.length < 8) return null;
  const H = harmonic(S, 4), frames = H.map(peaksOf);
  // строй записи: средний сдвиг пиков от равномерно темперированной сетки (в полутонах)
  let sc = 0, ss = 0;
  frames.forEach(pk => pk.forEach(p => { if (p.f < 100) return; const d = MIDI(p.f), fr = d - Math.round(d), w = Math.sqrt(p.a); sc += w * Math.cos(2 * Math.PI * fr); ss += w * Math.sin(2 * Math.PI * fr); }));
  const tune = Math.atan2(ss, sc) / (2 * Math.PI);
  // хрома по кадрам: верхние голоса (C3…C7) и бас (E1…E3)
  const treb = [], bass = [], Ct = new Array(12).fill(0), Cb = new Array(12).fill(0);
  frames.forEach(pk => {
    const w = suppressOvertones(pk), ct = new Array(12).fill(0), cb = new Array(12).fill(0);
    let low = null, lowMax = 0;
    pk.forEach((p, i) => {
      const m = MIDI(p.f) - tune, n = Math.round(m), pc = ((n % 12) + 12) % 12, c = Math.cos(Math.PI * (m - n)) ** 2, v = Math.sqrt(p.a) * w[i] * c;
      if (m >= 47.5 && m < 96) ct[pc] += v;
      if (m >= 27.5 && m < 55) lowMax = Math.max(lowMax, p.a);
    });
    // бас — самая низкая уверенная нота кадра (а не сумма: иначе низкие ноты считаются дважды — основной тон и октава)
    pk.forEach(p => { const m = MIDI(p.f) - tune; if (m >= 27.5 && m < 55 && p.a >= .3 * lowMax && (!low || p.f < low.f)) low = { f: p.f, a: p.a, m }; });
    if (low) { const n = Math.round(low.m); cb[((n % 12) + 12) % 12] += Math.sqrt(low.a); }
    treb.push(ct); bass.push(cb);
    for (let i = 0; i < 12; i++) { Ct[i] += ct[i]; Cb[i] += cb[i]; }
  });
  // аккорды по кадрам: 24 трезвучия, бонус за корень в басу; сглаживание — держим аккорд, пока другой не станет заметно лучше
  const tmpl = [];
  for (let r = 0; r < 12; r++) for (const q of ['M', 'm']) { const v = new Array(12).fill(0); v[r] = 1; v[(r + (q === 'M' ? 4 : 3)) % 12] = 1; v[(r + 7) % 12] = .8; tmpl.push({ r, q, v }); }
  const hist = new Map(); let prev = -1;
  treb.forEach((ct, t) => {
    const e = ct.reduce((a, b) => a + b, 0) + cb0(bass[t]);
    if (e < 1e-4) return;
    const sum = ct.map((v, i) => v + .6 * bass[t][i]);
    let bi = -1, bs = .35, s2 = -1;
    tmpl.forEach((c, i) => { const s = corr(sum, c.v) + (bass[t][c.r] >= Math.max(...bass[t]) && bass[t][c.r] > 0 ? .08 : 0); if (s > bs) { s2 = bs; bs = s; bi = i; } else if (s > s2) s2 = s; });
    if (prev >= 0 && bi !== prev) { const sp = corr(sum, tmpl[prev].v); if (sp > bs - .05) bi = prev; }
    if (bi >= 0) {
      // без терции (квинта, «пауэр-аккорд») мажорный и минорный шаблоны равны — такой аккорд за лад не голосует
      const c = tmpl[bi], twin = tmpl.find(x => x.r === c.r && x.q !== c.q), gap = Math.abs(corr(sum, c.v) - corr(sum, twin.v));
      const third = sum[(c.r + (c.q === 'M' ? 4 : 3)) % 12], other = sum[(c.r + (c.q === 'M' ? 3 : 4)) % 12], peak = Math.max(...sum);
      if (gap < .04 || third < .2 * peak || third < 1.3 * other) { hist.set(c.r + 'M', (hist.get(c.r + 'M') || 0) + .5 * Math.sqrt(e)); hist.set(c.r + 'm', (hist.get(c.r + 'm') || 0) + .5 * Math.sqrt(e)); }
      else hist.set(c.r + c.q, (hist.get(c.r + c.q) || 0) + Math.sqrt(e));
      prev = bi;
    }
  });
  const htot = [...hist.values()].reduce((a, b) => a + b, 0) || 1;
  // итог по 24 тональностям: профиль верхних голосов + бас + аккорды
  const res = [];
  for (const mode of ['major', 'minor']) for (let k = 0; k < 12; k++) {
    const sp = corr(Ct, rot(PROF[mode], k)), sb = Cb.some(v => v > 0) ? corr(Cb, rot(BASS[mode], k)) : 0;
    let sch = 0; FUNC[mode].forEach(([iv, q, w]) => { sch += w * (hist.get(((k + iv) % 12) + q) || 0) / htot; });
    res.push({ k, mode, s: sp + .35 * sb + 1.1 * sch });
  }
  res.sort((a, b) => b.s - a.s);
  const top = res[0], other = res.find(r => r.mode !== top.mode);
  return { key: KEYS[top.k], mode: top.mode, conf: clamp((top.s - other.s) * 3), tune: Math.round(tune * 100) };
}
const cb0 = v => v.reduce((a, b) => a + b, 0);

/* Уверенность в ладе ниже этого — лад «неясен» (обычно это мажор и параллельный минор на одних и тех же аккордах).
   Тогда лад берётся с карты настроения пользователя. Порог подобран на тестовых наборах: помечает 5 из 8 ошибок
   и лишь 9 из 100 верных ответов. */
export const MODE_SURE = .25;

/* ---------------- энергия ---------------- */
/* Энергия песни 0…1 из того, что известно (недостающие части не учитываются, веса перераспределяются):
   bpm — темп; loud — громкость 0…1; dens — плотность атак 0…1; bright — яркость звука 0…1; mode — лад. */
export function estimateEnergy({ bpm, mode, loud, dens, bright } = {}) {
  const parts = [];
  if (bpm > 0) parts.push([clamp((bpm - 60) / 120), .3]);
  if (loud != null && isFinite(loud)) parts.push([clamp(loud), .3]);
  if (dens != null && isFinite(dens)) parts.push([clamp(dens), .25]);
  if (bright != null && isFinite(bright)) parts.push([clamp(bright), .15]);
  if (!parts.length) return null;
  let e = parts.reduce((s, p) => s + p[0] * p[1], 0) / parts.reduce((s, p) => s + p[1], 0);
  e += mode === 'minor' ? -.04 : mode === 'major' ? .03 : 0;
  return r2(clamp(.05 + .95 * e));
}
/* Громкость по ReplayGain-поправке Deezer (gain, дБ): громкие мастеринги имеют большую отрицательную поправку. */
export const gainToLoud = g => (typeof g === 'number' && isFinite(g) ? r2(clamp((5 - g) / 18)) : null);
/* Наш темп и темп каталога: совпали — берём каталог (точнее); отличаются вдвое — тот, что ближе к «естественным» ~115;
   не связаны — каталог (он измерен по всей песне, а не по 30 секундам). */
function pickBpm(dzBpm, ours) {
  if (!dzBpm) return ours;
  if (!ours) return dzBpm;
  const q = dzBpm / ours, near = (a, b) => Math.abs(a / b - 1) < .06;
  if (near(q, 2) || near(q, .5)) return Math.abs(Math.log2(dzBpm / 115)) <= Math.abs(Math.log2(ours / 115)) ? dzBpm : ours;
  return dzBpm;
}
/* Фрагмент песни (an) + данные каталога (dz: { bpm, gain }) */
export function combineSongData(an, dz) {
  const dzBpm = dz && dz.bpm >= 40 && dz.bpm <= 250 ? Math.round(dz.bpm) : 0;
  if (an && an.bpm) {
    const bpm = pickBpm(dzBpm, an.bpm);
    const sure = !(an.modeConf < MODE_SURE);
    return { bpm, mode: sure ? an.mode : null, key: sure ? an.key : null, bright: an.bright, conf: an.conf, src: 'preview', ...(dzBpm && bpm === dzBpm ? { dz: true } : {}), ...(sure ? {} : { mu: true }),
      energy: estimateEnergy({ bpm, mode: sure ? an.mode : null, loud: an.loud, dens: an.dens, bright: an.bright }) };
  }
  if (dzBpm) return { bpm: dzBpm, mode: null, src: 'db', dz: true, energy: estimateEnergy({ bpm: dzBpm, loud: gainToLoud(dz.gain) }) };
  return null;
}

/* ---------------- всё вместе ---------------- */
/* samples: Float32Array (моно) или массив каналов; sr — частота дискретизации */
export function analyzeSamples(samples, sr) {
  let mono = samples;
  if (Array.isArray(samples)) {                            // смесь каналов
    const n = samples[0].length; mono = new Float32Array(n);
    samples.forEach(c => { for (let i = 0; i < n; i++) mono[i] += c[i] / samples.length; });
  }
  const maxLen = Math.floor(sr * 45), off = Math.max(0, Math.floor((mono.length - maxLen) / 2));
  const part = mono.subarray(off, off + Math.min(maxLen, mono.length));
  const xa = sr > RA + 1 ? resample(part, sr, RA) : sr < RA - 1 ? resample(part, sr, RA) : Float32Array.from(part);
  const x = resample(xa, RA, R);
  // громкость
  let rms = 0; for (let i = 0; i < x.length; i += 2) rms += x[i] * x[i];
  rms = Math.sqrt(rms / Math.max(1, Math.ceil(x.length / 2)));
  const loud = clamp((20 * Math.log10(rms + 1e-9) + 30) / 20);
  // темп и плотность атак
  const { on, centroid, act } = onsetEnvelope(xa), tp = act < .01 ? { bpm: 0, conf: 0 } : tempoOf(on);   // тишина или ровный звук — ударов нет
  let dens = 0;
  if (on.length > 50 && act >= .01) {
    let m = 0, m2 = 0; for (let j = 0; j < on.length; j++) { m += on[j]; m2 += on[j] * on[j]; }
    let mx = 0; for (let j = 0; j < on.length; j++) mx = Math.max(mx, on[j]);
    m /= on.length; const thr = Math.max(m + Math.sqrt(Math.max(0, m2 / on.length - m * m)), .3 * mx, 1e-6), gap = Math.max(1, Math.round(.1 / HOP_SEC));
    let cnt = 0, last = -gap;
    for (let j = 1; j < on.length - 1; j++) if (on[j] > thr && on[j] >= on[j - 1] && on[j] >= on[j + 1] && j - last >= gap) { cnt++; last = j; }
    dens = clamp((cnt / (on.length * HOP_SEC) - .5) / 4.5);
  }
  const k = keyOf(x) || { key: 'C', mode: 'major', conf: 0 };
  const bpm = tp.bpm ? Math.max(40, Math.min(220, tp.bpm)) : 0, bright = r2(clamp((centroid - 600) / 2400));
  return { bpm, mode: k.mode, key: k.key, bright, loud: r2(loud), dens: r2(dens), conf: r2((tp.conf + k.conf) / 2), modeConf: r2(k.conf), tempoConf: r2(tp.conf),
    ...(k.conf < MODE_SURE ? { mu: true } : {}),
    energy: estimateEnergy({ bpm, mode: k.mode, loud, dens, bright }) };
}

/* Декодирование — средствами браузера (mp3, m4a/AAC, ogg, wav); все каналы смешиваются. */
export async function analyzeAudioBuffer(arrayBuffer) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(arrayBuffer);
    const ch = []; for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) ch.push(buf.getChannelData(c));
    return analyzeSamples(ch.length > 1 ? ch : ch[0], buf.sampleRate);
  } finally { ctx.close(); }
}
/* Файл уже проверен checkAudio. */
export const analyzeAudioFile = async file => analyzeAudioBuffer(await file.arrayBuffer());
