/* =====================================================================
   Экран категории («внутри пузыря»): все воспоминания категории сеткой.
   Поиск по названию и тексту, сортировка по дате (группы по месяцам) или по настроению
   (группы по настроению), перенос карточки в другую категорию через меню «⋯».
   Весь текст выводится через React (без HTML), поиск — обычное сравнение строк.
   ===================================================================== */
import { html, useState, useEffect, useRef, useMemo } from '../lib/react.js';
import { parseLocalDate } from '../lib/util.js';
import { catOf, byNewest } from '../core/layout.js';
import { quadrant, isMood, moodSector } from '../core/analysis.js';
import { useT } from '../i18n/index.js';
import { Scene } from './Scene.js';
import { MoodFace } from './MoodFace.js';
import { catLabel } from './MemoryMap.js';

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
const QORDER = ['delight', 'calmJoy', 'anxiety', 'sad'];

function MoveMenu({ d, cats, current, onMove, t }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null), btn = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const out = e => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') { setOpen(false); btn.current && btn.current.focus(); } };
    document.addEventListener('pointerdown', out); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key); };
  }, [open]);
  const targets = [...cats.filter(c => c.id !== current).map(c => ({ id: c.id, name: catLabel(c, t) })), ...(current ? [{ id: null, name: t('catv.none') }] : [])];
  return html`<div class="cv-menu" ref=${root}>
    <button ref=${btn} type="button" class="cv-dots" aria-haspopup="true" aria-expanded=${open} aria-label=${t('catv.actions', { title: d.title })} onClick=${() => setOpen(!open)}>⋯</button>
    ${open && html`<div class="cv-pop" role="group" aria-label=${t('catv.move')}>
      <span class="menu-h">${t('catv.move')}</span>
      ${targets.map(x => html`<button key=${x.id || 'none'} type="button" onClick=${() => { setOpen(false); onMove(d.id, x.id, x.name); }}>${x.name}</button>`)}
    </div>`}
  </div>`;
}

export function CategoryView({ catId, days, cats, layout, onBack, onOpen, onMove }) {
  const t = useT();
  const cat = cats.find(c => c.id === catId);
  const [q, setQ] = useState(''), [sort, setSort] = useState('date'), [status, setStatus] = useState('');
  const head = useRef(null);
  useEffect(() => { head.current && head.current.focus(); }, [catId]);

  const inCat = useMemo(() => days.filter(d => catOf(d, cats, layout) === catId), [days, cats, layout, catId]);
  const shown = useMemo(() => {
    const nq = norm(q.trim());
    const list = nq ? inCat.filter(d => norm(d.title).includes(nq) || norm(d.text).includes(nq)) : inCat;
    if (sort === 'date') {
      const groups = [];
      [...list].sort(byNewest).forEach(d => {
        const dt = parseLocalDate(d.date), key = dt ? `${dt.getFullYear()}-${dt.getMonth()}` : '—';
        let g = groups.find(x => x.key === key);
        if (!g) {
          const label = dt ? dt.toLocaleDateString(t.locale, { month: 'long', year: 'numeric' }) : '—';
          g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] }; groups.push(g);
        }
        g.items.push(d);
      });
      return groups;
    }
    const by = {};
    list.forEach(d => { const k = quadrant(d.style.aro, d.style.val); (by[k] = by[k] || []).push(d); });
    return QORDER.filter(k => by[k]).map(k => ({ key: k, label: t('q.' + k), items: by[k].sort((a, b) => b.style.val - a.style.val || b.style.aro - a.style.aro) }));
  }, [inCat, q, sort, t]);

  if (!cat) return null;
  const move = (id, to, name) => { onMove(id, to); setStatus(t('catv.moved', { name })); };
  const total = shown.reduce((n, g) => n + g.items.length, 0);
  const key = (e, id) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } };

  return html`<section class="catview" style=${{ '--cc': cat.color }} aria-labelledby="cv-title">
    <nav class="cv-crumbs" aria-label=${t('catv.crumbs')}>
      <button type="button" class="btn ghost" onClick=${onBack}>← ${t('catv.back')}</button>
    </nav>
    <div class="cv-head">
      <h2 id="cv-title" ref=${head} tabIndex="-1"><span class="cv-dot" aria-hidden="true"></span>${catLabel(cat, t)}</h2>
      <span class="muted">${inCat.length} ${t.plural('memories', inCat.length)}</span>
    </div>
    <div class="cv-tools">
      <input type="search" maxLength="100" value=${q} onChange=${e => setQ(e.target.value)} placeholder=${t('catv.search')} aria-label=${t('catv.search')}/>
      <div class="seg" role="group" aria-label=${t('catv.sort')}>
        ${['date', 'mood'].map(k => html`<button key=${k} type="button" aria-pressed=${sort === k} onClick=${() => setSort(k)}>${t(k === 'date' ? 'catv.sortDate' : 'catv.sortMood')}</button>`)}
      </div>
    </div>
    <p class="sr-only" role="status">${status}</p>
    ${!inCat.length
      ? html`<p class="cv-empty">${t('catv.empty')}</p>`
      : !total ? html`<p class="cv-empty">${t('catv.notFound')}</p>`
      : shown.map(g => html`<div key=${g.key} class="cv-group">
          <h3>${g.label} <small>${g.items.length}</small></h3>
          <ul class="cv-grid">${g.items.map(d => html`<li key=${d.id} class="cv-card">
            <div class="cv-open" role="button" tabIndex="0" aria-label=${t('map.open', { title: d.title })} onClick=${() => onOpen(d.id)} onKeyDown=${e => key(e, d.id)}>
              <${Scene} d=${d} live=${false}/>
            </div>
            <div class="cv-meta">
              <b>${d.title}</b>
              <span class="muted">${t.date(d.date)}</span>
              ${isMood(d.mood) && html`<span class="mood-chip"><${MoodFace} v=${d.mood.valence} e=${d.mood.energy}/>${t('sector.' + moodSector(d.mood.valence, d.mood.energy))}</span>`}
            </div>
            <${MoveMenu} d=${d} cats=${cats} current=${catId} onMove=${move} t=${t}/>
          </li>`)}</ul>
        </div>`)}
  </section>`;
}
