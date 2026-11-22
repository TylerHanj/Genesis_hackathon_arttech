/* =====================================================================
   Анализ звука загруженного файла (в браузере, без внешних сервисов).
   - темп: огибающая атак + автокорреляция (с поправкой к «естественным» 70–160 BPM);
   - лад и тональность: хрома-вектор (БПФ) + профили Крумхансла (мажор/минор);
   - энергия: громкость (RMS), как и раньше; «яркость» звука: спектральный центроид.
   Точность честно средняя: на ритмичной музыке темп обычно верен, лад — чаще всего.
   Чистые функции — их можно проверять и в браузере, и в Node.
   ===================================================================== */

function fft(re, im) {                                    // БПФ на месте, длина — степень двойки
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const corr = (a, b) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
};
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/* samples: Float32Array одного канала, sr: частота дискретизации */
export function analyzeSamples(samples, sr) {
  // 1) не больше 45 с из середины, понижение частоты до ~11 кГц (усреднение = простой фильтр)
  const maxLen = Math.floor(sr * 45), off = Math.max(0, Math.floor((samples.length - maxLen) / 2));
  const src = samples.subarray(off, off + Math.min(maxLen, samples.length));
  const f = Math.max(1, Math.round(sr / 11025)), rate = sr / f, n = Math.floor(src.length / f);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < f; k++) s += src[i * f + k]; x[i] = s / f; }

  // 2) энергия (как раньше: RMS × 3.2)
  let rms = 0; for (let i = 0; i < n; i += 4) rms += x[i] * x[i];
  const energy = clamp(Math.sqrt(rms / Math.ceil(n / 4)) * 3.2);

  // 3) темп: огибающая атак по «перепаду» сигнала
  const hop = 128, frames = Math.floor((n - 256) / hop), hopSec = hop / rate;
  const env = new Float32Array(Math.max(0, frames));
  let prev = 0;
  for (let j = 0; j < frames; j++) {
    let e = 0; const s0 = j * hop;
    for (let k = 1; k < 256; k++) { const d = x[s0 + k] - x[s0 + k - 1]; e += d * d; }
    const le = Math.log(1 + 1000 * e); env[j] = Math.max(0, le - prev); prev = le;
  }
  const w = Math.max(1, Math.round(.3 / hopSec)), on = new Float32Array(frames);     // вычесть локальное среднее
  for (let j = 0; j < frames; j++) { let s = 0, c = 0; for (let k = Math.max(0, j - w); k <= Math.min(frames - 1, j + w); k++) { s += env[k]; c++; } on[j] = Math.max(0, env[j] - s / c); }
  let bpm = 0, conf = 0;
  if (frames > 50) {
    const r0 = on.reduce((s, v) => s + v * v, 0) || 1;
    const ac = lag => { let s = 0; for (let j = lag; j < frames; j++) s += on[j] * on[j - lag]; return s / r0; };
    let best = 0, bestScore = -1, bestRaw = 0;
    const minLag = Math.ceil(60 / (200 * hopSec)), maxLag = Math.floor(60 / (50 * hopSec));
    const cache = {};
    for (let lag = minLag; lag <= maxLag; lag++) {
      const r = (cache[lag] = ac(lag));
      const b = 60 / (lag * hopSec), prior = Math.exp(-.5 * (Math.log2(b / 115) / .9) ** 2);   // «естественный» темп около 115
      const score = r * prior;
      if (score > bestScore) { bestScore = score; best = lag; bestRaw = r; }
    }
    // уточнение пика параболой
    const y0 = cache[best - 1] || 0, y1 = cache[best], y2 = cache[best + 1] || 0, den = y0 - 2 * y1 + y2;
    const lagF = den ? best + .5 * (y0 - y2) / den : best;
    bpm = Math.round(60 / (lagF * hopSec));
    conf = clamp(bestRaw * 2);
  }

  // 4) хрома и яркость: окна по 4096 отсчётов
  const N = 4096, step = 2048, chroma = new Array(12).fill(0);
  let centSum = 0, centN = 0;
  const hann = new Float32Array(N); for (let i = 0; i < N; i++) hann[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s0 = 0; s0 + N <= n; s0 += step) {
    for (let i = 0; i < N; i++) { re[i] = x[s0 + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    let mSum = 0, fSum = 0;
    for (let k = 1; k < N / 2; k++) {
      const freq = k * rate / N, mag = Math.hypot(re[k], im[k]);
      mSum += mag; fSum += mag * freq;
      if (freq < 55 || freq > 2000) continue;
      const pc = ((Math.round(12 * Math.log2(freq / 440) + 69) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
    if (mSum > 1e-6) { centSum += fSum / mSum; centN++; }
  }
  let mode = 'major', key = 0, modeConf = 0;
  if (chroma.some(v => v > 0)) {
    let bMaj = -2, kMaj = 0, bMin = -2, kMin = 0;
    for (let k = 0; k < 12; k++) {
      const rot = chroma.map((_, i) => chroma[(i + k) % 12]);
      const cM = corr(rot, MAJOR), cm = corr(rot, MINOR);
      if (cM > bMaj) { bMaj = cM; kMaj = k; }
      if (cm > bMin) { bMin = cm; kMin = k; }
    }
    if (bMin > bMaj) { mode = 'minor'; key = kMin; } else { key = kMaj; }
    modeConf = clamp(Math.abs(bMaj - bMin) * 4);
  }
  const centroid = centN ? centSum / centN : 1500;
  return { bpm: bpm ? Math.max(50, Math.min(200, bpm)) : 0, energy: Math.round(energy * 100) / 100, mode, key: KEYS[key],
    bright: Math.round(clamp((centroid - 600) / 2400) * 100) / 100, conf: Math.round(clamp((conf + modeConf) / 2) * 100) / 100 };
}

/* Файл уже проверен checkAudio. Декодирование — средствами браузера. */
export async function analyzeAudioFile(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    return analyzeSamples(buf.getChannelData(0), buf.sampleRate);
  } finally { ctx.close(); }
}
