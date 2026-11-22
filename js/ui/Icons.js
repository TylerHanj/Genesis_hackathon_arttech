/* Минималистичные векторные значки (вместо эмодзи). Цвет — currentColor. */
import { html } from '../lib/react.js';

const P = {
  text: 'M5 5h14M5 10h14M5 15h9M5 20h6',
  camera: 'M3 9a3 3 0 0 1 3-3h1.5L9 4h6l1.5 2H18a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  note: 'M9 18V5l11-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  pin: 'M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10zM12 13.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11.5a2.5 2.5 0 1 0 0-5M15 14.5c3 0 6 2 6 5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  cloud: 'M7 18a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 9.5a3.8 3.8 0 0 1 .5 7.5z',
};
const W = {
  clear: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  clouds: P.cloud,
  fog: 'M7 13a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 4.5a3.8 3.8 0 0 1 .5 7.5M4 17h16M6 21h12',
  rain: 'M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 6.5a3.8 3.8 0 0 1 .5 7.5M9 18l-1 3M13 18l-1 3M17 17l-1 3',
  snow: 'M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 6.5a3.8 3.8 0 0 1 .5 7.5M9 19h.01M13 20h.01M17 19h.01M11 22h.01M15 22h.01',
  storm: 'M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 6.5a3.8 3.8 0 0 1 .5 7.5M12 14l-2 4h3l-2 4',
};
export const Icon = ({ name, size = 18 }) => html`<svg class="i" viewBox="0 0 24 24" width=${size} height=${size} aria-hidden="true" focusable="false"><path d=${P[name]}/></svg>`;
export const WeatherIcon = ({ kind, size = 18 }) => html`<svg class="i" viewBox="0 0 24 24" width=${size} height=${size} aria-hidden="true" focusable="false"><path d=${W[kind] || W.clouds}/></svg>`;
