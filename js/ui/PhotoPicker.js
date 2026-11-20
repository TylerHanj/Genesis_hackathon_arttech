/* =====================================================================
   B1–B3. Фото: зона перетаскивания, вставка из буфера (Ctrl/⌘+V), превью,
   удаление отдельного фото, порядок (стрелки или перетаскивание миниатюр).
   Каждый файл проходит checkImage (белый список + сигнатура + размер), дубли отсекаются.
   ===================================================================== */
import { html, useState, useEffect, useRef } from '../lib/react.js';
import { LIMITS, checkImage } from '../lib/files.js';
import { useT } from '../i18n/index.js';

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const move = (arr, from, to) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

/* items: [{ key, kind: 'keep', url, p } | { key, kind: 'file', url, file }] */
export function PhotoPicker({ items, setItems, onError }) {
  const t = useT();
  const [over, setOver] = useState(false), [dragIdx, setDragIdx] = useState(null);
  const ref = useRef(items); ref.current = items;
  const full = items.length >= LIMITS.photos;

  async function add(list) {
    onError('');
    const next = [...ref.current];
    for (const file of list) {
      if (!file) continue;
      const key = `${file.name}|${file.size}|${file.type}`;
      if (next.some(x => x.key === key)) continue;                            // дубль
      if (next.length >= LIMITS.photos) { onError(t('form.photoLimit', { n: LIMITS.photos })); break; }
      const c = await checkImage(file);
      if (!c.ok) { onError(c.code === 'size' ? t('form.photoSize', { name: c.name, mb: c.mb }) : t('form.photoType', { name: c.name })); continue; }
      next.push({ key, kind: 'file', file, url: URL.createObjectURL(file) });
    }
    ref.current = next; setItems(next);
  }
  const remove = k => { const x = items[k]; if (x.kind === 'file') URL.revokeObjectURL(x.url); setItems(items.filter((_, j) => j !== k)); };
  const shift = (k, d) => { const to = k + d; if (to >= 0 && to < items.length) setItems(move(items, k, to)); };

  /* Ctrl/⌘+V в любом месте формы: берём только картинки из белого списка */
  useEffect(() => {
    const onPaste = e => {
      const files = [...((e.clipboardData && e.clipboardData.items) || [])]
        .filter(i => i.kind === 'file' && OK_TYPES.includes(i.type)).map(i => i.getAsFile()).filter(Boolean);
      if (!files.length) return;
      e.preventDefault();
      add(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const isFiles = e => [...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files');
  const zone = {
    onDragOver: e => { if (isFiles(e)) { e.preventDefault(); setOver(true); } },
    onDragLeave: () => setOver(false),
    onDrop: e => { if (!isFiles(e)) return; e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); },
  };
  const thumbDnD = k => ({
    draggable: true,
    onDragStart: e => { setDragIdx(k); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(k)); },
    onDragOver: e => { if (dragIdx !== null) e.preventDefault(); },
    onDrop: e => { if (dragIdx === null) return; e.preventDefault(); e.stopPropagation(); setItems(move(items, dragIdx, k)); setDragIdx(null); },
    onDragEnd: () => setDragIdx(null),
  });

  return html`<div class="photos">
    <span class="field-label" id="ph-label">${t('photos.title')}</span>
    ${items.length > 0 && html`<ol class="thumbs" aria-labelledby="ph-label">
      ${items.map((x, k) => html`<li key=${x.key} class=${'thumb' + (dragIdx === k ? ' dragging' : '')} style=${{ backgroundImage: `url("${x.url}")` }} ...${thumbDnD(k)}
          aria-label=${t('photos.n', { i: k + 1, n: items.length })}>
        ${k === 0 && html`<span class="badge">${t('photos.cover')}</span>`}
        <span class="thumb-tools">
          <button type="button" aria-label=${t('photos.left')} title=${t('photos.left')} disabled=${k === 0} onClick=${() => shift(k, -1)}>←</button>
          <button type="button" aria-label=${t('photos.right')} title=${t('photos.right')} disabled=${k === items.length - 1} onClick=${() => shift(k, 1)}>→</button>
          <button type="button" aria-label=${t('form.removePhoto')} title=${t('form.removePhoto')} onClick=${() => remove(k)}>×</button>
        </span>
      </li>`)}
    </ol>`}
    <label class=${'dropzone' + (over ? ' over' : '') + (full ? ' full' : '')} ...${zone}>
      <input class="sr-only" type="file" accept=${OK_TYPES.join(',')} multiple disabled=${full}
        onChange=${e => { add([...e.target.files]); e.target.value = ''; }}/>
      <span class="dz-icon" aria-hidden="true">＋</span>
      <span class="dz-text"><b>${full ? t('photos.full') : t('photos.drop')}</b>
        <small>${t('photos.paste')}</small><small>${t('photos.limitHint', { n: LIMITS.photos, mb: LIMITS.photoMB })}</small></span>
    </label>
  </div>`;
}
