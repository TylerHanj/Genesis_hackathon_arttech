/* =====================================================================
   Поиск по кругам и воспоминаниям (как подсказки YouTube).
   - В списке разные значки: круг (цвета самого круга) — категория, карточка — воспоминание.
   - Выбор круга: карта подлетает к кругу и подсвечивает его.
   - Выбор воспоминания: карта подлетает к его кругу, заходит внутрь и подсвечивает карточку
     (без круга — подлетает к самой карточке).
   - Клавиатура: «/» — к поиску, ↑ ↓ — выбор, Enter — открыть, Esc — закрыть (шаблон ARIA combobox).
   Всё текстом через React, без HTML; поиск — обычное сравнение строк в браузере.
   ===================================================================== */
import { html, useState, useEffect, useRef, useMemo } from '../lib/react.js';
import { useT } from '../i18n/index.js';
import { Icon } from './Icons.js';
import { catLabel } from './MemoryMap.js';

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
const MAX = 8, MAX_CATS = 3;

/* Где совпало и насколько хорошо: начало строки > начало слова > внутри. */
function rank(hay, q) {
  const h = norm(hay), i = h.indexOf(q);
  if (i < 0) return null;
  return { i, score: i === 0 ? 3 : /[\s«"'(.,—-]/.test(h[i - 1]) ? 2 : 1 };
}

export function findItems(query, days, cats, t, where) {
  const q = norm(query.trim());
  if (!q) return [];
  const out = [];
  cats.forEach(c => {
    const name = catLabel(c, t), r = rank(name, q);
    if (r) out.push({ type: 'cat', id: c.id, label: name, hit: r.i, color: c.color, score: 100 + r.score * 10,
      count: days.filter(d => where(d) === c.id).length });
  });
  const cut = out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, MAX_CATS);
  const mem = [];
  days.forEach(d => {
    const fields = [[d.title, 4], [d.ctx && d.ctx.place, 2], [d.song && d.song.title, 2], [d.song && d.song.artist, 2], [d.text, 1], [t.date(d.date), 1], [d.date, 1]];
    let best = null;
    fields.forEach(([v, w], k) => { const r = v && rank(v, q); if (r && (!best || r.score * w > best.s)) best = { s: r.score * w, k, i: r.i, v }; });
    if (!best) return;
    const item = { type: 'day', id: d.id, label: d.title, hit: best.k === 0 ? best.i : -1, score: best.s, date: d.date, color: d.style.sa, cat: where(d) };
    if (best.k > 0) {                                                       // совпало не в названии — показываем кусочек
      const v = String(best.v), a = Math.max(0, best.i - 24), b = Math.min(v.length, best.i + q.length + 36);
      item.snip = { pre: (a > 0 ? '…' : '') + v.slice(a, best.i), mid: v.slice(best.i, best.i + q.length), post: v.slice(best.i + q.length, b) + (b < v.length ? '…' : '') };
    }
    mem.push(item);
  });
  mem.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)));
  return [...cut, ...mem].slice(0, MAX);
}

/* Подсветка совпадения в подписи (индексы совпадают: нормализация не меняет длину строки). */
function Hl({ text, at, len }) {
  if (at < 0 || norm(text).length !== text.length) return text;
  return html`${text.slice(0, at)}<b>${text.slice(at, at + len)}</b>${text.slice(at + len)}`;
}

export function Search({ days, cats, where, onPick }) {
  const t = useT();
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), [act, setAct] = useState(-1);
  const inp = useRef(null), root = useRef(null);
  const items = useMemo(() => findItems(q, days, cats, t, where), [q, days, cats, t, where]);
  const catName = id => { const c = cats.find(x => x.id === id); return c ? catLabel(c, t) : t('search.noCat'); };

  useEffect(() => {                                   // «/» — фокус в поиск (если не печатаем в поле)
    const h = e => {
      const a = document.activeElement;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable))) return;
      e.preventDefault(); inp.current && inp.current.focus();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const out = e => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [open]);
  useEffect(() => { setAct(-1); }, [q]);

  const choose = it => { if (!it) return; setOpen(false); setQ(''); inp.current && inp.current.blur(); onPick(it); };
  const key = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAct(a => (items.length ? (a + 1) % items.length : -1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(a => (items.length ? (a <= 0 ? items.length - 1 : a - 1) : -1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[act >= 0 ? act : 0]); }
    else if (e.key === 'Escape') { if (open && q) setOpen(false); else { setQ(''); inp.current.blur(); } }
  };
  const shown = open && q.trim();
  const optId = i => 'srch-opt-' + i;

  return html`<div class="search" ref=${root} role="search">
    <div class="search-box">
      <${Icon} name="search" size=${18}/>
      <input ref=${inp} type="text" maxLength="80" value=${q} placeholder=${t('search.ph')} aria-label=${t('search.label')}
        role="combobox" aria-autocomplete="list" aria-expanded=${!!shown} aria-controls="srch-list"
        aria-activedescendant=${shown && act >= 0 ? optId(act) : undefined}
        onChange=${e => { setQ(e.target.value); setOpen(true); }} onFocus=${() => setOpen(true)} onKeyDown=${key}/>
      ${q ? html`<button type="button" class="search-clear" aria-label=${t('search.clear')} onClick=${() => { setQ(''); inp.current.focus(); }}><${Icon} name="close" size=${16}/></button>`
        : html`<kbd class="search-kbd" aria-hidden="true">/</kbd>`}
    </div>
    ${shown && html`<ul id="srch-list" class="search-list" role="listbox" aria-label=${t('search.label')}>
      ${items.length ? items.map((it, i) => html`<li key=${it.type + it.id} id=${optId(i)} role="option" aria-selected=${i === act}
          class=${'search-opt' + (i === act ? ' on' : '')} onPointerDown=${e => e.preventDefault()} onPointerEnter=${() => setAct(i)} onClick=${() => choose(it)}>
          <span class=${'search-ico ' + it.type} style=${{ '--ic': it.color }} title=${t(it.type === 'cat' ? 'search.kindCat' : 'search.kindDay')}>
            <${Icon} name=${it.type === 'cat' ? 'bubble' : 'card'} size=${18}/></span>
          <span class="search-txt">
            <span class="search-main"><${Hl} text=${it.label} at=${it.hit} len=${norm(q.trim()).length}/></span>
            <span class="search-sub">${it.type === 'cat'
              ? `${t('search.kindCat')} · ${it.count} ${t.plural('memories', it.count)}`
              : html`${t.date(it.date)} · ${catName(it.cat)}${it.snip ? html` · <span class="search-snip">${it.snip.pre}<b>${it.snip.mid}</b>${it.snip.post}</span>` : ''}`}</span>
          </span>
        </li>`)
        : html`<li class="search-none" role="option" aria-disabled="true">${t('search.none')}</li>`}
    </ul>`}
  </div>`;
}
