/* =====================================================================
   Минималистичное векторное лицо настроения (вместо эмодзи).
   Рисуется по двум числам, поэтому подходит для любой точки карты:
   v (−1 грустно … +1 радостно) — изгиб рта и наклон бровей,
   e (−1 спокойно … +1 энергично) — размер глаз, подъём бровей, открытый рот.
   Цвет — currentColor, поэтому лицо само подстраивается под палитру и тему.
   ===================================================================== */
import { html } from '../lib/react.js';

const n = x => Math.round(x * 100) / 100;

export function MoodFace({ v = 0, e = 0, label }) {
  let eyes;
  if (e < -0.35 && v > 0.15) {
    eyes = html`<path class="line" d="M11.5 17.5 q2.5 -3 5 0 M23.5 17.5 q2.5 -3 5 0"/>`;          // довольные, прикрытые
  } else if (e < -0.55 && v > -0.2) {
    eyes = html`<path class="line" d="M11.5 17 h5 M23.5 17 h5"/>`;                                // спокойные, полуприкрытые
  } else if (e < -0.55) {
    eyes = html`<path class="line" d="M11.5 16.5 q2.5 2.2 5 0 M23.5 16.5 q2.5 2.2 5 0"/>`;          // тоска: тяжёлые веки
  } else {
    const r = n(1.5 + 1.1 * Math.max(0, e));
    eyes = html`<circle class="fill" cx="14" cy="16.5" r=${r}/><circle class="fill" cx="26" cy="16.5" r=${r}/>`;
  }

  let brows = null;
  if (v < -0.2) {
    const inner = -v * 3, y = 11.5 - Math.max(0, e) * 1.5;                                        // грусть/тревога — внутренние края вверх
    brows = html`<path class="line" d=${`M10.5 ${n(y)} L16.5 ${n(y - inner)} M29.5 ${n(y)} L23.5 ${n(y - inner)}`}/>`;
  } else if (e > 0.45) {
    const y = n(11.2 - e * 1.6);                                                                  // энергия — приподнятые дуги
    brows = html`<path class="line" d=${`M11 ${y} q3 -2.2 6 0 M23 ${y} q3 -2.2 6 0`}/>`;
  }

  let mouth;
  if (v > 0.35 && e > 0.35) mouth = html`<path class="fill" d="M13.5 25 L26.5 25 Q20 33.5 13.5 25 Z"/>`;        // восторг
  else if (v < -0.25 && e > 0.35) mouth = html`<path class="line" d="M13.5 27.5 q1.6 -1.8 3.25 0 t3.25 0 t3.25 0 t3.25 0"/>`; // тревога
  else mouth = html`<path class="line" d=${`M14 27 Q20 ${n(27 + v * 6 + (e < -0.55 && v > -0.2 ? 1.5 : 0))} 26 27`}/>`; // улыбка ↔ грусть; спокойствие — лёгкая улыбка

  return html`<svg class="face" viewBox="0 0 40 40" focusable="false" role=${label ? 'img' : undefined} aria-label=${label || undefined} aria-hidden=${label ? undefined : 'true'}>
    <circle class="head" cx="20" cy="20" r="17"/>${brows}${eyes}${mouth}
  </svg>`;
}

/* Лица для углов карты настроения */
export const CORNERS = { anxiety: [-0.75, 0.75], delight: [0.75, 0.75], sad: [-0.75, -0.75], calmJoy: [0.75, -0.75] };
