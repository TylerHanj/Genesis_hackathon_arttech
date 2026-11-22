/* =====================================================================
   Карта воспоминаний.
   Исправлено по аудиту:
   - перетаскивание больше не выделяет текст на странице (D4/Б1);
   - карточки доступны с клавиатуры: Tab + Enter (Б7);
   - обработка pointercancel и зум двумя пальцами на телефоне (Б8, Б9);
   - раскладка карточек хранится в служебной записи пользователя, а не в каждом дне:
     перетаскивание больше не отправляет на сервер весь день с фото (Б10).
   ===================================================================== */
import { html, useState, useEffect, useRef } from '../lib/react.js';
import { clamp, hash } from '../lib/util.js';
import { useT, allValues } from '../i18n/index.js';
import { Scene } from './Scene.js';
import { catOf as catOfDay, packCircle, looseSpot, byNewest, PREVIEW_MAX } from '../core/layout.js';

/* 8 кругов стоят так же, как сектора на карте настроения: вверху — энергично, справа — радостно,
   внизу — спокойно, слева — грустно (сетка 3×3 без центра). */
const GX = 470, GY = 480;
const DEF = [['kandinsky', 215, -1, -1], ['alert', 165, 0, -1], ['collage', 8, 1, -1], ['gloom', 285, -1, 0], ['joy', 48, 1, 0],
  ['minimal', 250, -1, 1], ['film', 90, 0, 1], ['monet', 35, 1, 1]];
const GRID = Object.fromEntries(DEF.map(([k, h, gx, gy]) => [k, { x: gx * GX, y: gy * GY, h }]));
const newCat = (k, t, p) => ({ id: 'c-' + k, name: t('cat.' + k), x: p.x, y: p.y, r: 190, color: `hsl(${GRID[k].h} 45% 52%)` });
export const defaultCats = t => DEF.map(([k]) => newCat(k, t, GRID[k]));

/* Переход на 8 кругов (META_V в backend.js):
   v1 → 3: добавляются «Светлые дни», «В движении», «Тяжёлые дни» — только если пользователь пользуется стандартными кругами;
   v2 → 3: исправление первой версии перехода (новые круги вставали в ряд справа, если хоть один старый круг был чуть сдвинут).
   - Если 5 прежних кругов стоят примерно там, где стояли изначально (каждый не дальше 200 от своего места —
     случайный сдвиг при перетаскивании не считается), все стандартные круги встают в сетку 3×3 как на карте настроения.
     Свои круги пользователя, если сетка на них наезжает, отодвигаются в ближайшее свободное место.
   - Если круги заметно переставляли, раскладка пользователя не трогается, а новые круги ставятся в ближайшее
     свободное место рядом со своим местом в сетке. Названия, цвета и записи не меняются; удалённый круг не возвращается. */
const OLD = ['monet', 'kandinsky', 'minimal', 'collage', 'film'], NEW = ['joy', 'alert', 'gloom'];
const oldPos = i => ({ x: Math.round(Math.cos(i * 1.2566 - 1.5708) * 380), y: Math.round(Math.sin(i * 1.2566 - 1.5708) * 380) });
const overlaps = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 40;
function freeSpot(cats, p, r = 190) {
  const me = { ...p, r };
  if (cats.every(c => !overlaps(c, me))) return { x: p.x, y: p.y };
  for (let d = 120; d <= 4000; d += 120) {                                 // по спирали от желаемого места
    for (let a = 0; a < 360; a += 30) {
      const q = { x: Math.round(p.x + Math.cos(a * Math.PI / 180) * d), y: Math.round(p.y + Math.sin(a * Math.PI / 180) * d), r };
      if (cats.every(c => !overlaps(c, q))) return { x: q.x, y: q.y };
    }
  }
  return { x: p.x + 5000, y: p.y };
}
export function upgradeCats(cats, t, fromV = 1) {
  const has = id => cats.some(c => c.id === id), std = c => /^c-/.test(c.id) && !!GRID[c.id.slice(2)];
  if (!OLD.some(k => has('c-' + k))) return cats;                                   // своя система кругов — не трогаем
  const nearRing = OLD.every((k, i) => { const c = cats.find(x => x.id === 'c-' + k); return !c || Math.hypot(c.x - oldPos(i).x, c.y - oldPos(i).y) <= 200; });
  let out = cats.map(c => (nearRing && std(c) ? { ...c, x: GRID[c.id.slice(2)].x, y: GRID[c.id.slice(2)].y } : c));
  if (fromV < 2) for (const k of NEW) if (!has('c-' + k)) out.push(newCat(k, t, nearRing ? GRID[k] : freeSpot(out, GRID[k])));
  if (nearRing) {                                                                   // свои круги не должны лежать под сеткой
    const placed = out.filter(std);
    out = out.map(c => {
      if (std(c) || placed.every(p => !overlaps(p, c))) { if (!std(c)) placed.push(c); return c; }
      const q = freeSpot(placed, { x: c.x, y: c.y }, c.r), moved = { ...c, ...q };
      placed.push(moved); return moved;
    });
  }
  return out;
}
/* Стандартные категории показываются на текущем языке, пока пользователь их не переименовал. */
export function catLabel(c, t) {
  const m = /^c-(monet|kandinsky|minimal|collage|film|joy|alert|gloom)$/.exec(c.id);
  return m && allValues('cat.' + m[1]).includes(c.name) ? t('cat.' + m[1]) : c.name;
}

let lastView = null;
export const resetMapView = () => { lastView = null; };

export function MemoryMap({ days, cats, layout, onOpen, onMeta, onSort, onSeed, onEnterCat }) {
  const t = useT();
  const box = useRef(null);
  const [v, setV] = useState(lastView || { x: 400, y: 300, k: .7 });
  const [drag, setDrag] = useState(null), [name, setName] = useState(''), [add, setAdd] = useState(false), [ed, setEd] = useState(null);
  const vRef = useRef(v); vRef.current = v;

  const tool = useRef(null);
  /* Вписать все круги и карточки в видимую область (с учётом панели инструментов). */
  const fitView = () => {
    const r = box.current.getBoundingClientRect();
    const pts = [];
    cats.forEach(c => { pts.push([c.x - c.r, c.y - c.r - 56], [c.x + c.r, c.y + c.r + 12]); });
    days.forEach(d => { const p = base(d); if (p) pts.push([p.x - 50, p.y - 80], [p.x + 50, p.y + 100]); });
    if (!pts.length) return { x: r.width / 2, y: r.height / 2, k: .7 };
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const top = (tool.current ? tool.current.offsetHeight : 40) + 20, pad = 14, bottom = 28;
    const aw = Math.max(80, r.width - pad * 2), ah = Math.max(80, r.height - top - bottom);
    const k = clamp(Math.min(aw / (maxX - minX), ah / (maxY - minY)), .2, 1);
    return { k, x: pad + aw / 2 - ((minX + maxX) / 2) * k, y: top + ah / 2 - ((minY + maxY) / 2) * k };
  };
  useEffect(() => { if (!lastView) setV(fitView()); }, []);
  useEffect(() => { lastView = v; }, [v]);

  const zoom = (f, cx, cy) => setV(o => { const k = clamp(o.k * f, .25, 2.2), r = k / o.k; return { k, x: cx - (cx - o.x) * r, y: cy - (cy - o.y) * r }; });
  const zoomC = f => { const r = box.current.getBoundingClientRect(); zoom(f, r.width / 2, r.height / 2); };
  useEffect(() => {
    const el = box.current;
    const h = e => { e.preventDefault(); const r = el.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.1 : .9, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  /* ---- где лежит карточка ----
     В круге: до 6 новых карточек аккуратной сеткой (packCircle), остальные — «+N» и экран категории.
     Без категории: там, куда положил пользователь (или в свободной зоне под кругами). */
  const catOf = d => catOfDay(d, cats, layout);
  const loosePos = d => { const e = layout[d.id]; if (e && !e.auto && e.cat == null) return { x: e.x, y: e.y }; if (!e && d.pos && d.cat == null) return d.pos; return looseSpot(d.id); };
  const dx = drag ? drag.dx : 0, dy = drag ? drag.dy : 0;
  const cs = cats.map(c => (drag && drag.type === 'cat' && drag.id === c.id ? { ...c, x: c.x + dx, y: c.y + dy } : c));
  const plan = (() => {                                                   // id дня → { x, y, s }; круг → { more, hidden }
    const pos = {}, extra = {};
    cs.forEach(c => {
      const inCat = days.filter(d => catOf(d) === c.id).sort(byNewest);
      const pk = packCircle(c, inCat.length);
      inCat.slice(0, PREVIEW_MAX).forEach((d, k) => { pos[d.id] = { ...pk.pts[k], s: pk.s }; });
      extra[c.id] = { more: pk.more, hidden: Math.max(0, inCat.length - PREVIEW_MAX), s: pk.s };
    });
    days.forEach(d => { if (!pos[d.id] && !cs.some(c => c.id === catOf(d))) pos[d.id] = { ...loosePos(d), s: 1 }; });
    return { pos, extra };
  })();
  const base = d => plan.pos[d.id] || null;
  const show = d => {
    const p = base(d); if (!p) return null;
    return drag && drag.type === 'card' && drag.id === d.id ? { ...p, x: p.x + dx, y: p.y + dy } : p;
  };

  const finish = (type, id, ax, ay) => {
    if (type === 'card') {
      const d = days.find(x => x.id === id); if (!d) return;
      const p = base(d) || looseSpot(d.id), np = { x: p.x + ax, y: p.y + ay };
      let best = null, bd = 1e9;
      cats.forEach(c => { const m = Math.hypot(np.x - c.x, np.y - c.y); if (m < c.r && m < bd) { best = c; bd = m; } });
      onMeta({ layout: { ...layout, [id]: { x: Math.round(np.x), y: Math.round(np.y), cat: best ? best.id : null } } });
    } else {
      onMeta({ cats: cats.map(x => (x.id === id ? { ...x, x: Math.round(x.x + ax), y: Math.round(x.y + ay) } : x)) });   // карточки едут вместе с кругом
    }
  };

  /* перетаскивание карточки или круга */
  const begin = (e, type, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY, k = vRef.current.k; let moved = false;
    const mv = ev => { const ax = (ev.clientX - sx) / k, ay = (ev.clientY - sy) / k; if (Math.abs(ax * k) + Math.abs(ay * k) > 5) moved = true; setDrag({ type, id, dx: ax, dy: ay }); };
    const end = (ev, cancel) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cn);
      setDrag(null);
      if (cancel) return;
      if (!moved) { if (type === 'card') onOpen(id); return; }
      finish(type, id, (ev.clientX - sx) / k, (ev.clientY - sy) / k);
    };
    const up = ev => end(ev, false), cn = ev => end(ev, true);
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cn);
  };

  /* панорама одним пальцем/мышью и зум двумя пальцами */
  const ptrs = useRef(new Map()), gest = useRef(null);
  const local = e => { const r = box.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const startGesture = target => {
    const pts = [...ptrs.current.values()], o = vRef.current;
    if (pts.length === 1) gest.current = { type: 'pan', s: pts[0], o, moved: false, target: target || null };
    else if (pts.length >= 2) {
      const [a, b] = pts, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gest.current = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, wx: (mid.x - o.x) / o.k, wy: (mid.y - o.y) / o.k, k0: o.k };
    } else gest.current = null;
  };
  const onDown = e => {
    if (e.target.closest('input,button,select,textarea,a')) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();                                                  // не начинать выделение текста
    try { box.current.setPointerCapture(e.pointerId); } catch (x) {}
    const first = ptrs.current.size === 0;
    ptrs.current.set(e.pointerId, local(e)); startGesture(first ? e.target : null);
  };
  const onMove = e => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, local(e));
    const g = gest.current; if (!g) return;
    const pts = [...ptrs.current.values()];
    if (g.type === 'pan') {
      if (Math.abs(pts[0].x - g.s.x) + Math.abs(pts[0].y - g.s.y) > 5) g.moved = true;
      setV({ ...g.o, x: g.o.x + pts[0].x - g.s.x, y: g.o.y + pts[0].y - g.s.y });
    } else if (pts.length >= 2) {
      const [a, b] = pts, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = clamp(g.k0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, .25, 2.2);
      setV({ k, x: mid.x - g.wx * k, y: mid.y - g.wy * k });
    }
  };
  const onUp = e => {
    if (!ptrs.current.delete(e.pointerId)) return;
    const g = gest.current;
    if (g && g.type === 'pan' && !g.moved && !ptrs.current.size && e.type === 'pointerup' && g.target && g.target.closest) {
      const circ = g.target.closest('.circ');                            // клик по пустому месту круга → войти в категорию
      if (circ && !g.target.closest('.mc,.clab,.more')) { gest.current = null; onEnterCat(circ.dataset.id); return; }
    }
    startGesture(null);
  };

  const addCat = () => {
    const n = name.trim().slice(0, 60); if (!n) return;
    const r = box.current.getBoundingClientRect();
    onMeta({ cats: [...cats, { id: 'c' + Date.now().toString(36), name: n, x: Math.round((r.width / 2 - v.x) / v.k), y: Math.round((r.height / 2 - v.y) / v.k), r: 170, color: `hsl(${hash(n) % 360} 45% 52%)` }] });
    setName(''); setAdd(false);
  };
  const delCat = c => {
    if (!window.confirm(t('map.delCatConfirm', { name: catLabel(c, t) }))) return;
    const nl = { ...layout };
    days.filter(d => catOf(d) === c.id).forEach(d => { const p = base(d) || { x: c.x, y: c.y }; nl[d.id] = { x: Math.round(p.x), y: Math.round(p.y), cat: null }; });
    onMeta({ cats: cats.filter(x => x.id !== c.id), layout: nl });
  };
  const rename = () => { if (ed && ed.value.trim()) onMeta({ cats: cats.map(c => (c.id === ed.id ? { ...c, name: ed.value.trim().slice(0, 60) } : c)) }); setEd(null); };
  const stop = e => e.stopPropagation();
  const cardKey = (e, id) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } };

  return html`<div class="map" ref=${box} role="region" aria-label=${t('map.label')}
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}
      style=${{ backgroundPosition: `${v.x}px ${v.y}px`, backgroundSize: `${28 * v.k}px ${28 * v.k}px` }}>
    <div class="world" style=${{ transform: `translate(${v.x}px,${v.y}px) scale(${v.k})` }}>
      ${cs.map(c => { const ex = plan.extra[c.id]; return html`<div key=${c.id} class="circ" data-id=${c.id} title=${t('map.circTitle')} style=${{ left: c.x - c.r, top: c.y - c.r, width: c.r * 2, height: c.r * 2, '--cc': c.color }}>
        <div class="clab" onPointerDown=${e => begin(e, 'cat', c.id)} onDoubleClick=${() => setEd({ id: c.id, value: catLabel(c, t) })} title=${t('map.catTitle')}>
          ${ed && ed.id === c.id
            ? html`<input autoFocus=${true} maxLength="60" aria-label=${t('map.catName')} value=${ed.value} onPointerDown=${stop} onChange=${e => setEd({ ...ed, value: e.target.value })} onBlur=${rename} onKeyDown=${e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEd(null); }}/>`
            : html`<span>${catLabel(c, t)}</span>`}
          <small>${days.filter(d => catOf(d) === c.id).length}</small>
          <button class="clab-btn" aria-label=${t('map.rename')} title=${t('map.rename')} onPointerDown=${stop} onClick=${() => setEd({ id: c.id, value: catLabel(c, t) })}>✎</button>
          <button class="clab-btn open" aria-label=${t('map.openCat', { name: catLabel(c, t) })} title=${t('map.openCat', { name: catLabel(c, t) })} onPointerDown=${stop} onClick=${() => onEnterCat(c.id)}>↗</button>
          <button class="clab-btn" aria-label=${t('map.delCat')} title=${t('map.delCat')} onPointerDown=${stop} onClick=${() => delCat(c)}>×</button>
        </div>
        ${ex && ex.more && html`<button class="more" style=${{ left: ex.more.x - (c.x - c.r), top: ex.more.y - (c.y - c.r), '--s': ex.s }}
            aria-label=${t('map.moreAria', { n: ex.hidden, name: catLabel(c, t) })} onPointerDown=${stop} onClick=${() => onEnterCat(c.id)}>+${ex.hidden}</button>`}
      </div>`; })}
      ${days.map(d => {
        const p = show(d); if (!p) return null;
        const on = drag && drag.type === 'card' && drag.id === d.id;
        return html`<div key=${d.id} class=${'mc' + (on ? ' dr' : '')} style=${{ left: p.x - 42, top: p.y - 75, '--s': p.s }}
            role="button" tabIndex="0" aria-label=${t('map.open', { title: d.title })}
            onPointerDown=${e => begin(e, 'card', d.id)} onKeyDown=${e => cardKey(e, d.id)}>
          <${Scene} d=${d} live=${false}/><span>${d.title}</span></div>`;
      })}
    </div>
    <div class="mtool" ref=${tool} onPointerDown=${stop}>
      ${add
        ? html`<input type="text" autoFocus=${true} maxLength="60" aria-label=${t('map.catName')} placeholder=${t('map.catName')} value=${name} onChange=${e => setName(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') setAdd(false); }}/>
               <button class="btn pri" onClick=${addCat}>${t('map.create')}</button><button class="btn" onClick=${() => setAdd(false)}>${t('cancel')}</button>`
        : html`<button class="btn pri" onClick=${() => setAdd(true)}>${t('map.addCat')}</button>
               <button class="btn" onClick=${onSort} title=${t('map.sortTitle')}>${t('map.sort')}</button>`}
      <button class="btn sq" aria-label=${t('map.zoomIn')} title=${t('map.zoomIn')} onClick=${() => zoomC(1.25)}>+</button>
      <button class="btn sq" aria-label=${t('map.zoomOut')} title=${t('map.zoomOut')} onClick=${() => zoomC(.8)}>−</button>
      <button class="btn sq" aria-label=${t('map.fit')} title=${t('map.fit')} onClick=${() => setV(fitView())}>⤢</button>
    </div>
    ${!days.length && html`<div class="mempty"><div onPointerDown=${stop}><p>${t('map.empty')}</p><button class="btn" onClick=${onSeed}>${t('map.demo')}</button></div></div>`}
    <div class="mhint">${t('map.hint')}</div>
  </div>`;
}
