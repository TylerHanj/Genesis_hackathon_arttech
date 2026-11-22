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
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5',
  bubble: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M14.5 9h.01M11.5 14.5h.01M15.5 14h.01',
  card: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 16l4-4 3 3 2-2 5 5M14.5 8h.01',
  close: 'M6 6l12 12M18 6L6 18',
  map: 'M7.5 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM17 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 21a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  chevL: 'M15 5l-7 7 7 7',
  chevR: 'M9 5l7 7-7 7',
  chevD: 'M6 9l6 6 6-6',
  sort: 'M4 7h9M4 12h7M4 17h5M17 5v14M14 16l3 3 3-3',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  circlePlus: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v8M8 12h8',
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
