/* =====================================================================
   B4. Карта настроения: X — грустно ↔ радостно (valence), Y — спокойно ↔ энергично (energy).
   Значения от −1 до 1. Мышь, палец (pointer events) и клавиатура (стрелки, Shift — шаг больше,
   Home — в центр, Delete — сбросить).
   ===================================================================== */
import { html, useRef } from '../lib/react.js';
import { clamp } from '../lib/util.js';
import { moodSector } from '../core/analysis.js';
import { useT } from '../i18n/index.js';
import { MoodFace, CORNERS } from './MoodFace.js';

const r2 = x => Math.round(x * 100) / 100;

export function MoodMap({ value, onChange, id = 'moodmap' }) {
  const t = useT();
  const box = useRef(null), dragging = useRef(false);
  const v = value;
  const setFrom = e => {
    const r = box.current.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width), y = clamp((e.clientY - r.top) / r.height);
    onChange({ valence: r2(x * 2 - 1), energy: r2(1 - y * 2) });
  };
  const down = e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { box.current.setPointerCapture(e.pointerId); } catch (x) {}
    box.current.focus({ preventScroll: true });
    dragging.current = true; setFrom(e);
  };
  const move = e => { if (dragging.current) setFrom(e); };
  const up = () => { dragging.current = false; };
  const key = e => {
    const step = e.shiftKey ? .2 : .05, cur = v || { valence: 0, energy: 0 };
    let nv = cur.valence, ne = cur.energy;
    switch (e.key) {
      case 'ArrowLeft': nv -= step; break;
      case 'ArrowRight': nv += step; break;
      case 'ArrowUp': ne += step; break;
      case 'ArrowDown': ne -= step; break;
      case 'Home': nv = 0; ne = 0; break;
      case 'Delete': case 'Backspace': e.preventDefault(); onChange(null); return;
      default: return;
    }
    e.preventDefault();
    onChange({ valence: r2(clamp(nv, -1, 1)), energy: r2(clamp(ne, -1, 1)) });
  };
  const name = v ? t('sector.' + moodSector(v.valence, v.energy)) : null;
  const pct = x => Math.round((x + 1) * 50);
  const valueText = v ? t('moodmap.value', { name, v: pct(v.valence), e: pct(v.energy) }) : t('moodmap.none');
  return html`<div class="moodmap">
    <div class="mm-head">
      <h3 id=${id + '-h'}>${t('moodmap.title')}</h3>
      ${v && html`<button type="button" class="mm-clear" onClick=${() => onChange(null)}>${t('moodmap.clear')}</button>`}
    </div>
    <p class="hint" id=${id + '-d'}>${t('moodmap.hint')}</p>
    <div class="mm-frame">
      <span class="mm-axis top">${t('moodmap.axisEnergy')}</span>
      <span class="mm-axis bottom">${t('moodmap.axisCalm')}</span>
      <span class="mm-axis left">${t('moodmap.axisSad')}</span>
      <span class="mm-axis right">${t('moodmap.axisJoy')}</span>
      <div class=${'mm-area' + (v ? ' set' : '')} ref=${box} tabIndex="0" role="slider"
          aria-labelledby=${id + '-h'} aria-describedby=${id + '-d ' + id + '-k'} aria-roledescription=${t('moodmap.title')}
          aria-valuemin="0" aria-valuemax="100" aria-valuenow=${v ? pct(v.valence) : 50} aria-valuetext=${valueText}
          onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onKeyDown=${key}>
        ${[['tl', 'anxiety'], ['tr', 'delight'], ['bl', 'sad'], ['br', 'calmJoy']].map(([pos, k]) => html`<span key=${k} class=${'mm-corner ' + pos}>
          <${MoodFace} v=${CORNERS[k][0]} e=${CORNERS[k][1]}/>${t('q.' + k)}</span>`)}
        ${v
          ? html`<span class="mm-dot" style=${{ left: `${(v.valence + 1) * 50}%`, top: `${(1 - (v.energy + 1) / 2) * 100}%` }}></span>`
          : html`<span class="mm-tap" aria-hidden="true">${t('moodmap.tap')}</span>`}
      </div>
    </div>
    <p class="mm-value" aria-live="polite">${v
      ? html`<${MoodFace} v=${v.valence} e=${v.energy}/><b>${name}</b><span>${t('moodmap.short', { v: pct(v.valence), e: pct(v.energy) })}</span>`
      : html`<span class="muted">${t('moodmap.optional')}</span>`}</p>
    <p class="sr-only" id=${id + '-k'}>${t('moodmap.keys')}</p>
  </div>`;
}
