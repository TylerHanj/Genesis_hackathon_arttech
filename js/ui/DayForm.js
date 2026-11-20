/* Форма дня (новый и редактирование).
   Исправлено: фото добавляются к уже выбранным (а не заменяют), видны превью, дубли отсекаются,
   тип проверяется по сигнатуре; дата обязательна и по местному времени; песня необязательна;
   ссылка проверяется белым списком; при редактировании место на карте не теряется. */
import { html, useState, useEffect, useRef } from '../lib/react.js';
import { todayLocal, isValidDate, uid } from '../lib/util.js';
import { LIMITS, checkImage, checkAudio, prepImage, audioEnergy } from '../lib/files.js';
import { parseTrackLink } from '../lib/links.js';
import { makeDay, GENRES, DEFAULT_SONG } from '../core/analysis.js';
import { useT } from '../i18n/index.js';

export function DayForm({ init, onSave, onCancel }) {
  const t = useT();
  const s0 = init ? init.song : {};
  const [f, setF] = useState({
    date: init ? init.date : todayLocal(), text: init ? init.text : '', keep: init ? init.photos : [],
    link: s0.link || '', artist: s0.artist || '', genre: s0.genre && GENRES[s0.genre] ? s0.genre : 'поп', year: s0.year || '',
    bpm: s0.bpm || DEFAULT_SONG.bpm, mode: s0.mode || DEFAULT_SONG.mode, energy: s0.energy == null ? DEFAULT_SONG.energy : s0.energy,
    title: init && init.manualTitle ? init.title : '',
  });
  const [files, setFiles] = useState([]);           // [{file, url, key}]
  const [audio, setAudio] = useState(null);
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const filesRef = useRef(files); filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach(x => URL.revokeObjectURL(x.url)), []);

  const genre = g => { const p = GENRES[g]; setF(o => ({ ...o, genre: g, bpm: p[0], energy: p[1], mode: p[2] ? 'minor' : 'major' })); };
  const room = () => LIMITS.photos - f.keep.length - files.length;

  async function addFiles(list, input) {
    setErr('');
    const incoming = [...list];
    const next = [...files];
    for (const file of incoming) {
      const key = `${file.name}|${file.size}|${file.type}`;
      if (next.some(x => x.key === key)) continue;                      // дубль
      if (f.keep.length + next.length >= LIMITS.photos) { setErr(t('form.photoLimit', { n: LIMITS.photos })); break; }
      const c = await checkImage(file);
      if (!c.ok) { setErr(c.code === 'size' ? t('form.photoSize', { name: c.name, mb: c.mb }) : t('form.photoType', { name: c.name })); continue; }
      next.push({ file, key, url: URL.createObjectURL(file) });
    }
    setFiles(next);
    if (input) input.value = '';                                         // можно выбрать тот же файл снова
  }
  const dropFile = k => setFiles(arr => { URL.revokeObjectURL(arr[k].url); return arr.filter((_, j) => j !== k); });

  async function pickAudio(e) {
    const a = e.target.files[0]; setErr('');
    if (!a) { setAudio(null); return; }
    const c = await checkAudio(a);
    if (!c.ok) { setErr(c.code === 'size' ? t('form.audioSize', { name: c.name, mb: c.mb }) : t('form.audioType', { name: c.name })); e.target.value = ''; setAudio(null); return; }
    setAudio(a);
    try { set('energy', await audioEnergy(a)); } catch (x) { /* энергия останется ручной */ }
  }

  async function submit() {
    const total = f.keep.length + files.length;
    if (!isValidDate(f.date)) { setErr(t('form.badDate')); return; }
    if (!f.text.trim() || !total) { setErr(t('form.need')); return; }
    const link = f.link.trim();
    if (link && !parseTrackLink(link)) { setErr(t('form.badLink')); return; }
    setErr(''); setBusy(true);
    try {
      const photos = [...f.keep];
      for (const x of files.slice(0, LIMITS.photos - f.keep.length)) photos.push(await prepImage(x.file));
      const fileUrl = audio ? URL.createObjectURL(audio) : (s0.fileUrl || null);
      const day = makeDay({
        id: init && init.id, date: f.date, text: f.text.slice(0, 20000), photos, customTitle: f.title.trim().slice(0, 140), newId: uid,
        song: { link, artist: f.artist.slice(0, 120), genre: f.genre, year: f.year.slice(0, 12), bpm: +f.bpm, mode: f.mode, energy: +f.energy,
          fileName: audio ? audio.name.slice(0, 120) : (s0.fileName || ''), fileUrl },
      });
      if (init) { if ('cat' in init) day.cat = init.cat; if (init.pos) day.pos = init.pos; }   // место на карте сохраняется
      onSave(day);
    } catch (e) { console.warn('[form]', e); setErr(t('form.photoErr')); setBusy(false); }
  }

  return html`<div class="card form">
    <h2>${init ? t('form.titleEdit') : t('form.titleNew')}</h2>
    <label>${t('form.date')}<input type="date" required value=${f.date} max="2100-12-31" onChange=${e => set('date', e.target.value)}/></label>
    <label>${t('form.text')}<span class="hint">${t('form.textHint')}</span>
      <textarea value=${f.text} maxLength="20000" onChange=${e => set('text', e.target.value)} placeholder=${t('form.textPh')}></textarea></label>
    ${init && html`<label>${t('form.folder')}<span class="hint">${t('form.folderHint')}</span><input type="text" maxLength="140" value=${f.title} onChange=${e => set('title', e.target.value)}/></label>`}
    ${(f.keep.length > 0 || files.length > 0) && html`<div class="thumbs">
      ${f.keep.map((p, k) => html`<div key=${'k' + k} class="thumb" style=${{ backgroundImage: `url("${p.url}")` }}><button type="button" aria-label=${t('form.removePhoto')} onClick=${() => set('keep', f.keep.filter((_, j) => j !== k))}>×</button></div>`)}
      ${files.map((x, k) => html`<div key=${x.key} class="thumb" style=${{ backgroundImage: `url("${x.url}")` }}><button type="button" aria-label=${t('form.removePhoto')} onClick=${() => dropFile(k)}>×</button></div>`)}
    </div>`}
    <label>${t('form.photos', { n: LIMITS.photos })}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled=${room() <= 0} onChange=${e => addFiles(e.target.files, e.target)}/></label>
    <p class="hint soft">${t('form.songRecommend')}</p>
    <div class="row">
      <label>${t('form.songLink')}<span class="hint">${t('form.songLinkHint')}</span><input type="url" inputMode="url" maxLength="2048" value=${f.link} onChange=${e => set('link', e.target.value)} placeholder="https://…"/></label>
      <label>${t('form.songFile')}<span class="hint">${t('form.songFileHint')}</span><input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.m4a,.ogg" onChange=${pickAudio}/></label>
    </div>
    <div class="row">
      <label>${t('form.artist')}<input type="text" maxLength="120" value=${f.artist} onChange=${e => set('artist', e.target.value)}/></label>
      <label>${t('form.year')}<input type="text" maxLength="12" inputMode="numeric" value=${f.year} onChange=${e => set('year', e.target.value)}/></label>
    </div>
    <div class="row">
      <label>${t('form.genre')}<select value=${f.genre} onChange=${e => genre(e.target.value)}>${Object.keys(GENRES).map(g => html`<option key=${g} value=${g}>${g}</option>`)}</select></label>
      <label>${t('form.mode')}<select value=${f.mode} onChange=${e => set('mode', e.target.value)}><option value="major">${t('form.major')}</option><option value="minor">${t('form.minor')}</option></select></label>
    </div>
    <div class="row">
      <label>${t('form.tempo', { n: f.bpm })}<input type="range" min="50" max="180" value=${f.bpm} onChange=${e => set('bpm', e.target.value)}/></label>
      <label>${t('form.energy', { n: Math.round(f.energy * 100) })}${audio ? t('form.measured') : ''}<input type="range" min="0" max="1" step=".05" value=${f.energy} onChange=${e => set('energy', e.target.value)}/></label>
    </div>
    ${err && html`<div class="err" role="alert">${err}</div>`}
    <div class="bar">
      <button type="button" class="btn" disabled=${busy} onClick=${submit}>${busy ? t('form.busy') : init ? t('form.saveEdit') : t('form.save')}</button>
      ${onCancel && html`<button type="button" class="btn ghost" onClick=${onCancel}>${t('cancel')}</button>`}
    </div>
  </div>`;
}
