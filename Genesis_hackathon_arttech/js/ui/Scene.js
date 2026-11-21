/* «Кадр» дня 9:16: фото + художественный приём. Перенесён из исходного файла без изменения вида. */
import { html, useState, useEffect, useMemo } from '../lib/react.js';
import { rng, hash } from '../lib/util.js';
import { useT } from '../i18n/index.js';

function Kand({ d }) {
  const sh = useMemo(() => {
    const r = rng(hash(d.id));
    return Array.from({ length: 10 }, () => ({ t: Math.floor(r() * 3), x: r() * 100, y: r() * 178, s: 8 + r() * 30, a: r() * 360 }));
  }, [d.id]);
  const st = d.style;
  return html`<svg class="kand" viewBox="0 0 100 178" preserveAspectRatio="xMidYMid slice" style=${{ '--sp': st.kspeed + 's' }} aria-hidden="true">
    ${sh.map((o, k) => html`<g key=${k} class="kg" style=${{ animationDelay: -k * 3 + 's' }}>${
      o.t === 0 ? html`<circle cx=${o.x} cy=${o.y} r=${o.s / 2} fill="none" stroke=${st.sa} stroke-width="1"/>`
      : o.t === 1 ? html`<line x1=${o.x - o.s} y1=${o.y} x2=${o.x + o.s} y2=${o.y} stroke=${st.si} stroke-width=".6" transform=${`rotate(${o.a} ${o.x} ${o.y})`}/>`
      : html`<polygon points=${`${o.x},${o.y - o.s / 2} ${o.x + o.s / 2},${o.y + o.s / 2} ${o.x - o.s / 2},${o.y + o.s / 2}`} fill=${st.sa} opacity=".55"/>`}</g>`)}
  </svg>`;
}
const collage = k => ({ inset: `${6 + k * 9}% ${6 + (k % 2) * 16}% ${38 - k * 5}% ${6 + ((k + 1) % 2) * 16}%`, transform: `rotate(${(k % 2 ? 3 : -3) * (k + 1)}deg)` });

export function Scene({ d, live = true }) {
  const t = useT();
  const st = d.style, n = d.photos.length, col = st.tech === 'collage', [i, setI] = useState(0);
  useEffect(() => {
    if (!live || n < 2 || col) return undefined;
    const tm = setInterval(() => setI(x => (x + 1) % n), st.sec * 1000);
    return () => clearInterval(tm);
  }, [live, n, st.sec, col]);
  const sig = d.text.split(/[.!?\n]/)[0].trim().split(/\s+/).slice(0, 9).join(' ');
  return html`<div class=${'scene t-' + st.tech} style=${{ '--s1': st.s1, '--s2': st.s2, '--sa': st.sa, '--si': st.si, '--g': st.grain }} aria-hidden=${live ? undefined : 'true'}>
    ${d.photos.slice(0, col ? 3 : n).map((p, k) => html`<div key=${k} class=${'ph' + (col || k === i ? ' on' : '')} style=${{ backgroundImage: `url("${p.url}")`, ...(col ? collage(k) : {}) }}></div>`)}
    ${st.tech === 'kandinsky' && html`<div class="duo"></div>`}
    ${st.tech === 'kandinsky' && html`<${Kand} d=${d}/>`}
    ${st.tech === 'monet' && html`<div class="wash"></div>`}
    ${st.tech === 'minimal' && html`<div class="dot"></div>`}
    <div class="grain"></div>${st.tech === 'film' && html`<div class="vig"></div>`}<div class="scrim"></div>
    <div class="dt">${t.date(d.date)}</div><div class="ttl">${d.title}</div><div class="sig">${sig}…</div>
  </div>`;
}
