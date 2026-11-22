/* =====================================================================
   Календарь записанных дней.
   - Месяц сеткой: в днях с воспоминаниями — фото дня и его цвет, число записей; сегодня — кольцом.
   - Выбор дня: справа (компьютер) или ниже (телефон) — воспоминания этого дня; для пустого прошедшего дня —
     «Записать этот день» (форма откроется с этой датой).
   - Переход по месяцам: ‹ ›, «Сегодня», выбор месяца и года по нажатию на заголовок, свайп на телефоне.
   - Клавиатура (шаблон ARIA grid): стрелки — день/неделя, PageUp/PageDown — месяц, Home/End — неделя, Enter — открыть.
   MiniCalendar — маленький месяц для левой панели на компьютере.
   Всё текстом через React; фото — те же проверенные data-URL, что и на карте.
   ===================================================================== */
import { html, useState, useEffect, useRef, useMemo } from '../lib/react.js';
import { parseLocalDate, todayLocal } from '../lib/util.js';
import { isMood, moodSector } from '../core/analysis.js';
import { useT } from '../i18n/index.js';
import { MoodFace } from './MoodFace.js';
import { Icon } from './Icons.js';

const pad = n => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;            // m — с нуля
const parts = s => { const d = parseLocalDate(s); return d ? { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() } : null; };
const addDays = (s, n) => { const d = parseLocalDate(s); d.setDate(d.getDate() + n); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
const addMonths = (s, n) => {
  const p = parts(s), last = new Date(p.y, p.m + n + 1, 0).getDate(), d = new Date(p.y, p.m + n, Math.min(p.d, last));
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
};
const weekStart = lang => (lang === 'en' ? 0 : 1);                        // en — с воскресенья, ru/kk — с понедельника

function weeks(y, m, ws) {
  const first = new Date(y, m, 1), shift = (first.getDay() - ws + 7) % 7, out = [];
  let cur = new Date(y, m, 1 - shift);
  do {
    const row = [];
    for (let i = 0; i < 7; i++) { row.push({ date: ymd(cur.getFullYear(), cur.getMonth(), cur.getDate()), day: cur.getDate(), out: cur.getMonth() !== m }); cur.setDate(cur.getDate() + 1); }
    out.push(row);
  } while (cur.getMonth() === m);
  return out;
}
export function byDate(days) {
  const map = new Map();
  days.forEach(d => { if (!map.has(d.date)) map.set(d.date, []); map.get(d.date).push(d); });
  map.forEach(list => list.sort((a, b) => String(a.id).localeCompare(String(b.id))));
  return map;
}
const thumb = d => (d.photos && d.photos[0] && d.photos[0].url) || null;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- большой календарь ---------- */
export function Calendar({ days, state, setState, onOpen, onNew, where }) {
  const t = useT();
  const today = todayLocal();
  const sel = state.sel || today, view = state.view || sel.slice(0, 7);
  const [vy, vm] = view.split('-').map(Number), m0 = vm - 1;
  const [picker, setPicker] = useState(false), [py, setPy] = useState(vy);
  const map = useMemo(() => byDate(days), [days]);
  const grid = useMemo(() => weeks(vy, m0, weekStart(t.lang)), [vy, m0, t.lang]);
  const focusNext = useRef(false), gridRef = useRef(null), swipe = useRef(null);
  const set = (s, v) => setState({ sel: s, view: v || s.slice(0, 7) });
  const go = n => { const s = addMonths(sel, n); set(s); };
  const monthTitle = cap(new Date(vy, m0, 1).toLocaleDateString(t.locale, { month: 'long', year: 'numeric' }));
  const wd = grid[0].map(c => new Date(parseLocalDate(c.date)).toLocaleDateString(t.locale, { weekday: 'short' }));
  const inMonth = days.filter(d => d.date.startsWith(view));
  const daysWith = new Set(inMonth.map(d => d.date)).size;

  useEffect(() => {                                    // после стрелок — фокус на новый день
    if (!focusNext.current || !gridRef.current) return;
    focusNext.current = false;
    const b = gridRef.current.querySelector(`[data-date="${sel}"]`); if (b) b.focus();
  }, [sel, view]);
  const key = e => {
    const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let s = null;
    if (mv) s = addDays(sel, mv);
    else if (e.key === 'PageUp') s = addMonths(sel, -1);
    else if (e.key === 'PageDown') s = addMonths(sel, 1);
    else if (e.key === 'Home' || e.key === 'End') { const dow = (parseLocalDate(sel).getDay() - weekStart(t.lang) + 7) % 7; s = addDays(sel, e.key === 'Home' ? -dow : 6 - dow); }
    else if (e.key === 'Enter' || e.key === ' ') { const list = map.get(sel); if (list && list.length === 1) { e.preventDefault(); onOpen(list[0].id); } return; }
    if (!s) return;
    e.preventDefault(); focusNext.current = true; set(s);
  };
  /* свайп по сетке на телефоне: влево — следующий месяц, вправо — предыдущий */
  const pdown = e => { if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY }; };
  const pup = e => {
    const s0 = swipe.current; swipe.current = null; if (!s0) return;
    const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) go(dx < 0 ? 1 : -1);
  };

  const list = map.get(sel) || [];
  const selTitle = cap(parseLocalDate(sel).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

  return html`<section class="cal card" aria-labelledby="cal-title">
    <div class="cal-main">
      <div class="cal-head">
        <button type="button" class="btn sq ghost" aria-label=${t('cal.prev')} title=${t('cal.prev')} onClick=${() => go(-1)}><${Icon} name="chevL"/></button>
        <button type="button" id="cal-title" class="cal-title" aria-expanded=${picker} aria-controls="cal-picker" onClick=${() => { setPy(vy); setPicker(!picker); }}>${monthTitle}<${Icon} name="chevD" size=${16}/></button>
        <button type="button" class="btn sq ghost" aria-label=${t('cal.next')} title=${t('cal.next')} onClick=${() => go(1)}><${Icon} name="chevR"/></button>
        <button type="button" class="btn ghost cal-today" onClick=${() => set(today)} disabled=${sel === today && view === today.slice(0, 7)}>${t('cal.today')}</button>
      </div>
      <p class="cal-stats muted">${inMonth.length ? t('cal.stats', { n: inMonth.length, memories: t.plural('memories', inMonth.length), d: daysWith, days: t.plural('days', daysWith) }) : t('cal.emptyMonth')}</p>
      ${picker && html`<div id="cal-picker" class="cal-picker" role="group" aria-label=${t('cal.pick')}>
        <div class="cal-py"><button type="button" class="btn sq ghost" aria-label=${t('cal.prevYear')} onClick=${() => setPy(py - 1)}><${Icon} name="chevL"/></button>
          <b>${py}</b><button type="button" class="btn sq ghost" aria-label=${t('cal.nextYear')} onClick=${() => setPy(py + 1)}><${Icon} name="chevR"/></button></div>
        <div class="cal-months">${Array.from({ length: 12 }, (_, i) => {
          const k = `${py}-${pad(i + 1)}`, n = days.filter(d => d.date.startsWith(k)).length;
          return html`<button key=${k} type="button" class=${'cal-mo' + (k === view ? ' on' : '')} onClick=${() => { const p = parts(sel), last = new Date(py, i + 1, 0).getDate(); set(ymd(py, i, Math.min(p.d, last))); setPicker(false); }}>
            ${cap(new Date(py, i, 1).toLocaleDateString(t.locale, { month: 'short' }))}${n ? html`<small>${n}</small>` : ''}</button>`;
        })}</div>
      </div>`}
      <div class="cal-grid" role="grid" aria-labelledby="cal-title" ref=${gridRef} onKeyDown=${key} onPointerDown=${pdown} onPointerUp=${pup} onPointerCancel=${() => { swipe.current = null; }}>
        <div class="cal-row cal-wd" role="row">${wd.map((w, i) => html`<span key=${i} role="columnheader" class="cal-w">${w}</span>`)}</div>
        ${grid.map((row, ri) => html`<div key=${ri} class="cal-row" role="row">${row.map(c => {
          const items = map.get(c.date) || [], d0 = items[0], img = d0 && thumb(d0);
          const label = `${t.date(c.date)}: ${items.length ? `${items.length} ${t.plural('memories', items.length)}` : t('cal.noneShort')}`;
          return html`<div key=${c.date} role="gridcell" aria-selected=${c.date === sel}>
            <button type="button" data-date=${c.date} tabIndex=${c.date === sel ? 0 : -1} aria-label=${label} aria-current=${c.date === today ? 'date' : undefined}
              class=${'cal-d' + (c.out ? ' out' : '') + (items.length ? ' has' : '') + (c.date === today ? ' today' : '') + (c.date === sel ? ' sel' : '') + (c.date > today ? ' future' : '')}
              style=${d0 ? { '--c1': d0.style.s1, '--c2': d0.style.sa } : undefined}
              onClick=${() => { if (c.date === sel && items.length === 1) onOpen(items[0].id); else set(c.date, c.out ? c.date.slice(0, 7) : view); }}>
              ${img && html`<img src=${img} alt="" loading="lazy" decoding="async"/>`}
              <span class="cal-n">${c.day}</span>
              ${items.length > 1 && html`<span class="cal-k" aria-hidden="true">${items.length}</span>`}
            </button>
          </div>`;
        })}</div>`)}
      </div>
      <p class="cal-hint muted">${t('cal.hint')}</p><p class="cal-hint cal-hint-touch muted">${t('cal.hintTouch')}</p>
    </div>
    <aside class="cal-day" aria-live="polite">
      <h3>${selTitle}</h3>
      ${list.length
        ? html`<ul class="cal-list">${list.map(d => html`<li key=${d.id}>
            <button type="button" class="cal-item" onClick=${() => onOpen(d.id)}>
              <span class="cal-th" style=${{ '--c1': d.style.s1, '--c2': d.style.sa }}>${thumb(d) && html`<img src=${thumb(d)} alt="" loading="lazy"/>`}</span>
              <span class="cal-it"><b>${d.title}</b>
                <span class="muted small">${[where && where(d), d.ctx && d.ctx.place].filter(Boolean).join(' · ')}</span>
                ${isMood(d.mood) && html`<span class="mood-chip"><${MoodFace} v=${d.mood.valence} e=${d.mood.energy}/>${t('sector.' + moodSector(d.mood.valence, d.mood.energy))}</span>`}</span>
            </button></li>`)}</ul>`
        : sel > today ? html`<p class="muted">${t('cal.future')}</p>`
        : html`<p class="muted">${t('cal.none')}</p><button type="button" class="btn" onClick=${() => onNew(sel)}><${Icon} name="plus" size=${16}/>${t('cal.write')}</button>`}
    </aside>
  </section>`;
}

/* ---------- маленький календарь для левой панели ---------- */
export function MiniCalendar({ days, onPick }) {
  const t = useT();
  const today = todayLocal();
  const [view, setView] = useState(today.slice(0, 7));
  const [vy, vm] = view.split('-').map(Number);
  const map = useMemo(() => byDate(days), [days]);
  const grid = useMemo(() => weeks(vy, vm - 1, weekStart(t.lang)), [vy, vm, t.lang]);
  const shift = n => { const d = new Date(vy, vm - 1 + n, 1); setView(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  const title = cap(new Date(vy, vm - 1, 1).toLocaleDateString(t.locale, { month: 'long', year: 'numeric' }));
  return html`<div class="side-block mini-cal" aria-labelledby="mc-title">
    <div class="mini-head">
      <button type="button" class="linkish" id="mc-title" onClick=${() => onPick(null, view)} title=${t('cal.openFull')}>${title}</button>
      <span><button type="button" class="mini-nav" aria-label=${t('cal.prev')} onClick=${() => shift(-1)}><${Icon} name="chevL" size=${14}/></button>
        <button type="button" class="mini-nav" aria-label=${t('cal.next')} onClick=${() => shift(1)}><${Icon} name="chevR" size=${14}/></button></span>
    </div>
    <div class="mini-grid">
      ${grid[0].map((c, i) => html`<span key=${'w' + i} class="mini-w" aria-hidden="true">${new Date(parseLocalDate(c.date)).toLocaleDateString(t.locale, { weekday: 'narrow' })}</span>`)}
      ${grid.flat().map(c => {
        const items = map.get(c.date) || [];
        return html`<button key=${c.date} type="button" class=${'mini-d' + (c.out ? ' out' : '') + (items.length ? ' has' : '') + (c.date === today ? ' today' : '')}
          style=${items.length ? { '--c2': items[0].style.sa } : undefined} tabIndex=${items.length || c.date === today ? 0 : -1}
          aria-label=${`${t.date(c.date)}: ${items.length ? `${items.length} ${t.plural('memories', items.length)}` : t('cal.noneShort')}`}
          onClick=${() => onPick(c.date)}>${c.day}</button>`;
      })}
    </div>
  </div>`;
}
