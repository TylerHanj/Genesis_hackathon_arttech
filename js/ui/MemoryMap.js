/* =====================================================================
   Карта воспоминаний.
   Исправлено по аудиту:
   - перетаскивание больше не выделяет текст на странице (D4/Б1);
   - карточки доступны с клавиатуры: Tab + Enter (Б7);
   - обработка pointercancel и зум двумя пальцами на телефоне (Б8, Б9);
   - раскладка карточек хранится в служебной записи пользователя, а не в каждом дне:
     перетаскивание больше не отправляет на сервер весь день с фото (Б10).
   ===================================================================== */
import { html, useState, useEffect, useRef, useMemo } from '../lib/react.js';
import { clamp, hash } from '../lib/util.js';
import { useT, allValues } from '../i18n/index.js';
import { Scene } from './Scene.js';
import { Icon } from './Icons.js';
import { packCircle, looseSpot, byNewest, PREVIEW_MAX } from '../core/layout.js';
import { makeSorter, manualCat } from '../core/sorter.js';

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

export function MemoryMap({ days, cats, layout, sorter, focus, onFocusDone, onOpen, onMeta, onSort, onSeed, onEnterCat }) {
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
  const sort0 = useMemo(() => sorter || makeSorter(days, cats, layout), [sorter, days, cats, layout]);
  const catOf = d => sort0.catOf(d);
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
    if (e.pointerType === 'touch') return;              // палец: см. onDown — перенос только после удержания
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
  /* Палец на телефоне: касание карточки не хватает её сразу.
     - палец поехал — двигается карта (как по пустому месту);
     - второй палец — масштаб двумя пальцами (раньше карточка «перехватывала» первый палец и масштаб не работал);
     - короткое касание — открыть воспоминание;
     - удержание ~0,4 с — карточка (или круг за подпись) «приподнимается» и переносится пальцем. */
  const lp = useRef(null);
  const cancelLp = () => { const st = lp.current; if (!st) return; clearTimeout(st.timer); if (st.active) setDrag(null); lp.current = null; };
  const onDown = e => {
    if (e.target.closest('input,button,select,textarea,a')) return;
    if (e.button !== undefined && e.button !== 0) return;
    cancelAnimationFrame(anim.current);                                  // пользователь сам двигает карту — перелёт прекращается
    e.preventDefault();                                                  // не начинать выделение текста
    try { box.current.setPointerCapture(e.pointerId); } catch (x) {}
    const first = ptrs.current.size === 0;
    if (!first) cancelLp();                                              // второй палец — это масштаб, не перенос
    ptrs.current.set(e.pointerId, local(e)); startGesture(first ? e.target : null);
    if (first && e.pointerType === 'touch') {
      const card = e.target.closest('.mc'), lab = !card && e.target.closest('.clab'), circ = lab && lab.closest('.circ');
      if (card || circ) {
        const st = { type: card ? 'card' : 'cat', id: card ? card.dataset.id : circ.dataset.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, active: false };
        st.timer = setTimeout(() => {
          if (lp.current !== st || ptrs.current.size !== 1) return;
          st.active = true; gest.current = null;
          if (navigator.vibrate) { try { navigator.vibrate(12); } catch (x) {} }
          setDrag({ type: st.type, id: st.id, dx: 0, dy: 0 });
        }, 420);
        lp.current = st;
      }
    }
  };
  const onMove = e => {
    if (!ptrs.current.has(e.pointerId)) return;
    const st = lp.current;
    if (st && st.pid === e.pointerId) {
      if (st.active) { const k = vRef.current.k; setDrag({ type: st.type, id: st.id, dx: (e.clientX - st.sx) / k, dy: (e.clientY - st.sy) / k }); ptrs.current.set(e.pointerId, local(e)); return; }
      if (Math.hypot(e.clientX - st.sx, e.clientY - st.sy) > 8) cancelLp();   // палец поехал до удержания — двигаем карту
    }
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
    const st = lp.current;
    if (st && st.pid === e.pointerId) {
      clearTimeout(st.timer); lp.current = null;
      if (st.active) {                                                   // перенос пальцем закончен
        const k = vRef.current.k, ax = (e.clientX - st.sx) / k, ay = (e.clientY - st.sy) / k;
        setDrag(null);
        if (e.type === 'pointerup') finish(st.type, st.id, ax, ay);
        startGesture(null); return;
      }
      const g0 = gest.current;
      if (st.type === 'card' && e.type === 'pointerup' && !ptrs.current.size && (!g0 || !g0.moved)) { gest.current = null; onOpen(st.id); return; }
    }
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
  /* Удаление круга: воспоминания не удаляются. Положенные туда вручную снова раскладываются сами —
     в подходящий круг (свой или ближайший по настроению), а если такого нет — в центр карты без круга. */
  const delCat = c => {
    if (!window.confirm(t('map.delCatConfirm', { name: catLabel(c, t) }))) return;
    const nl = { ...layout };
    days.forEach(d => { const m = manualCat(d, layout); if (m && m.cat === c.id) nl[d.id] = { auto: true }; });
    onMeta({ cats: cats.filter(x => x.id !== c.id), layout: nl });
  };
  const rename = () => { if (ed && ed.value.trim()) onMeta({ cats: cats.map(c => (c.id === ed.id ? { ...c, name: ed.value.trim().slice(0, 60) } : c)) }); setEd(null); };
  const stop = e => e.stopPropagation();

  /* ---- поиск: плавный перелёт к кругу или карточке и подсветка ---- */
  const anim = useRef(0), [hi, setHi] = useState(null);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  useEffect(() => { if (!hi) return undefined; const tm = setTimeout(() => setHi(null), 2600); return () => clearTimeout(tm); }, [hi]);
  const viewFor = (cx, cy, w, h) => {
    const r = box.current.getBoundingClientRect(), top = (tool.current ? tool.current.offsetHeight : 40) + 20, ah = Math.max(80, r.height - top - 28);
    const k = clamp(Math.min(r.width / w, ah / h), .3, 1.4);
    return { k, x: r.width / 2 - cx * k, y: top + ah / 2 - cy * k };
  };
  const flyTo = (to, done) => {
    cancelAnimationFrame(anim.current);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = vRef.current, t0 = performance.now(), dur = reduce ? 0 : 650;
    const step = now => {
      const p = dur ? Math.min(1, (now - t0) / dur) : 1, e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      setV({ k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (p < 1) anim.current = requestAnimationFrame(step); else done();
    };
    anim.current = requestAnimationFrame(step);
  };
  useEffect(() => {
    if (!focus || !box.current) return undefined;
    if (!lastView) vRef.current = fitView();                              // первый показ карты — летим от общего вида
    let c = null, p = null, enter = null;
    if (focus.type === 'cat') c = cats.find(x => x.id === focus.id);
    else {
      const d = days.find(x => x.id === focus.id);
      if (d) { c = cats.find(x => x.id === catOf(d)); if (c) enter = c.id; else p = plan.pos[d.id]; }
    }
    if (!c && !p) { if (onFocusDone) onFocusDone({ enter: null }); return undefined; }
    let tm = 0;
    setHi(null);
    flyTo(c ? viewFor(c.x, c.y - 24, c.r * 2 + 80, c.r * 2 + 120) : viewFor(p.x, p.y, 420, 420), () => {
      setHi(c ? { cat: c.id } : { day: focus.id });
      if (onFocusDone) tm = setTimeout(() => onFocusDone({ enter, day: focus.id }), enter ? 420 : 0);
    });
    return () => clearTimeout(tm);
  }, [focus && focus.n]);
  const cardKey = (e, id) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } };

  return html`<div class="map" ref=${box} role="region" aria-label=${t('map.label')}
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp} onContextMenu=${e => { if (lp.current) e.preventDefault(); }}
      style=${{ backgroundPosition: `${v.x}px ${v.y}px`, backgroundSize: `${28 * v.k}px ${28 * v.k}px` }}>
    <div class="world" style=${{ transform: `translate(${v.x}px,${v.y}px) scale(${v.k})` }}>
      ${cs.map(c => { const ex = plan.extra[c.id]; return html`<div key=${c.id} class=${'circ' + (hi && hi.cat === c.id ? ' hi' : '')} data-id=${c.id} title=${t('map.circTitle')} style=${{ left: c.x - c.r, top: c.y - c.r, width: c.r * 2, height: c.r * 2, '--cc': c.color }}>
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
        return html`<div key=${d.id} class=${'mc' + (on ? ' dr' : '') + (hi && hi.day === d.id ? ' hi' : '')} data-id=${d.id} style=${{ left: p.x - 42, top: p.y - 75, '--s': p.s }}
            role="button" tabIndex="0" aria-label=${t('map.open', { title: d.title })}
            onPointerDown=${e => begin(e, 'card', d.id)} onKeyDown=${e => cardKey(e, d.id)}>
          <${Scene} d=${d} live=${false}/><span>${d.title}</span></div>`;
      })}
    </div>
    <div class="mtool" ref=${tool} onPointerDown=${stop}>
      ${add
        ? html`<input type="text" autoFocus=${true} maxLength="60" aria-label=${t('map.catName')} placeholder=${t('map.catName')} value=${name} onChange=${e => setName(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') setAdd(false); }}/>
               <button class="btn pri" onClick=${addCat}>${t('map.create')}</button><button class="btn" onClick=${() => setAdd(false)}>${t('cancel')}</button>`
        : html`<button class="btn pri ico" onClick=${() => setAdd(true)} aria-label=${t('map.addCat')}><${Icon} name="circlePlus" size=${18}/><span class="lbl">${t('map.addCat')}</span></button>
               <button class="btn ico" onClick=${onSort} title=${t('map.sortTitle')} aria-label=${t('map.sort')}><${Icon} name="sort" size=${18}/><span class="lbl">${t('map.sort')}</span></button>`}
      <button class="btn sq" aria-label=${t('map.zoomIn')} title=${t('map.zoomIn')} onClick=${() => zoomC(1.25)}><${Icon} name="plus" size=${18}/></button>
      <button class="btn sq" aria-label=${t('map.zoomOut')} title=${t('map.zoomOut')} onClick=${() => zoomC(.8)}><${Icon} name="minus" size=${18}/></button>
      <button class="btn sq" aria-label=${t('map.fit')} title=${t('map.fit')} onClick=${() => setV(fitView())}><${Icon} name="fit" size=${18}/></button>
    </div>
    ${add && html`<p class="mtool-hint" onPointerDown=${stop}>${t('map.addHint')}</p>`}
    ${!days.length && html`<div class="mempty"><div onPointerDown=${stop}><p>${t('map.empty')}</p><button class="btn" onClick=${onSeed}>${t('map.demo')}</button></div></div>`}
    <div class="mhint">${t('map.hint')}</div>
    <div class="mhint-touch" aria-hidden="true">${t('map.touchHint')}</div>
  </div>`;
}
