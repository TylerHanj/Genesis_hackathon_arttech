/* =====================================================================
   Форма дня (новый и редактирование).
   Этап 5: слева карта настроения (B4); темп, лад и жанр убраны из интерфейса (A1) —
   они вычисляются из настроения функцией moodToMusicParams; исполнитель, год, энергия песни
   и начало фрагмента спрятаны в «Продвинутые настройки» (A2); фото: зона перетаскивания,
   Ctrl+V, превью, порядок (B1–B3).
   Сохранено с этапов 1–2: проверка файлов по сигнатуре, белый список ссылок, дата по местному
   времени, место на карте не теряется при редактировании.
   ===================================================================== */
import { html, useState, useEffect, useRef } from '../lib/react.js';
import { todayLocal, isValidDate, uid } from '../lib/util.js';
import { checkAudio, prepImage, audioEnergy } from '../lib/files.js';
import { parseTrackLink } from '../lib/links.js';
import { makeDay, DEFAULT_SONG, moodToMusicParams, isMood } from '../core/analysis.js';
import { useT } from '../i18n/index.js';
import { MoodMap } from './MoodMap.js';
import { PhotoPicker } from './PhotoPicker.js';

/* «1:25» / «85» → 85 секунд; пусто → 0; иначе null (ошибка) */
export function parseStart(s) {
  const v = String(s || '').trim();
  if (!v) return 0;
  let m = /^(\d{1,3}):([0-5]\d)$/.exec(v);
  if (m) return +m[1] * 60 + +m[2];
  m = /^\d{1,5}$/.exec(v);
  return m && +v <= 36000 ? +v : null;
}
const fmtStart = n => (n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '');

export function DayForm({ init, onSave, onCancel }) {
  const t = useT();
  const s0 = init ? init.song : {};
  const [f, setF] = useState({
    date: init ? init.date : todayLocal(), text: init ? init.text : '',
    link: s0.link || '', artist: s0.artist || '', year: s0.year || '', start: fmtStart(s0.start || 0),
    title: init && init.manualTitle ? init.title : '',
  });
  const [mood, setMood] = useState(init && isMood(init.mood) ? init.mood : null);
  const [items, setItems] = useState(() => (init ? init.photos.map((p, i) => ({ key: 'keep-' + i, kind: 'keep', url: p.url, p })) : []));
  const [audio, setAudio] = useState(null), [measured, setMeasured] = useState(null), [manualEnergy, setManualEnergy] = useState(null);
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const itemsRef = useRef(items); itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach(x => x.kind === 'file' && URL.revokeObjectURL(x.url)), []);

  /* A1: параметры песни. Настроение отмечено → из него; иначе — как было у записи (или по умолчанию). */
  const base = mood ? moodToMusicParams(mood.valence, mood.energy)
    : { bpm: s0.bpm || DEFAULT_SONG.bpm, mode: s0.mode || DEFAULT_SONG.mode, energy: s0.energy == null ? DEFAULT_SONG.energy : s0.energy };
  const energy = manualEnergy != null ? manualEnergy : measured != null ? measured : base.energy;
  const energyNote = manualEnergy != null ? t('adv.manual') : measured != null ? t('form.measured') : mood ? t('adv.auto') : '';

  async function pickAudio(e) {
    const a = e.target.files[0]; setErr(''); e.target.value = '';
    if (!a) return;
    const c = await checkAudio(a);
    if (!c.ok) { setErr(c.code === 'size' ? t('form.audioSize', { name: c.name, mb: c.mb }) : t('form.audioType', { name: c.name })); return; }
    setAudio(a); setMeasured(null);
    try { setMeasured(Math.round(await audioEnergy(a) * 100) / 100); } catch (x) { /* останется энергия по настроению */ }
  }

  async function submit() {
    if (!isValidDate(f.date)) { setErr(t('form.badDate')); return; }
    if (!f.text.trim() || !items.length) { setErr(t('form.need')); return; }
    const link = f.link.trim();
    if (link && !parseTrackLink(link)) { setErr(t('form.badLink')); return; }
    const start = parseStart(f.start);
    if (start === null) { setErr(t('adv.badStart')); return; }
    setErr(''); setBusy(true);
    try {
      const photos = [];
      for (const x of items) photos.push(x.kind === 'keep' ? x.p : await prepImage(x.file));
      const fileUrl = audio ? URL.createObjectURL(audio) : (s0.fileUrl || null);
      const day = makeDay({
        id: init && init.id, date: f.date, text: f.text.slice(0, 20000), photos, mood, customTitle: f.title.trim().slice(0, 140), newId: uid,
        song: {
          link, artist: f.artist.slice(0, 120), year: f.year.slice(0, 12), bpm: base.bpm, mode: base.mode, energy: +energy, start,
          ...(s0.genre && !mood ? { genre: s0.genre } : {}),
          fileName: audio ? audio.name.slice(0, 120) : (s0.fileName || ''), fileUrl,
        },
      });
      if (init) { if ('cat' in init) day.cat = init.cat; if (init.pos) day.pos = init.pos; }   // место на карте сохраняется
      onSave(day);
    } catch (e) { console.warn('[form]', e); setErr(t('form.photoErr')); setBusy(false); }
  }

  return html`<div class="card form day-form">
    <h2>${init ? t('form.titleEdit') : t('form.titleNew')}</h2>
    <div class="df-grid">
      <aside class="df-mood"><${MoodMap} value=${mood} onChange=${setMood}/></aside>
      <div class="df-main">
        <label>${t('form.date')}<input type="date" required value=${f.date} max="2100-12-31" onChange=${e => set('date', e.target.value)}/></label>
        <label>${t('form.text')}<span class="hint">${t('form.textHint')}</span>
          <textarea value=${f.text} maxLength="20000" onChange=${e => set('text', e.target.value)} placeholder=${t('form.textPh')}></textarea></label>
        ${init && html`<label>${t('form.folder')}<span class="hint">${t('form.folderHint')}</span><input type="text" maxLength="140" value=${f.title} onChange=${e => set('title', e.target.value)}/></label>`}
        <${PhotoPicker} items=${items} setItems=${setItems} onError=${setErr}/>
        <div class="song">
          <p class="hint soft">${t('form.songRecommend')}</p>
          <label>${t('form.songLink')}<span class="hint">${t('form.songLinkHint')}</span>
            <input type="url" inputMode="url" maxLength="2048" value=${f.link} onChange=${e => set('link', e.target.value)} placeholder="https://…"/></label>
          <div class="audio-pick">
            <label class="btn ghost file-btn">${t('audio.choose')}
              <input class="sr-only" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.m4a,.ogg" onChange=${pickAudio}/></label>
            ${audio
              ? html`<span class="file-name">♪ ${audio.name}</span><button type="button" class="link-btn" onClick=${() => { setAudio(null); setMeasured(null); }}>${t('audio.remove')}</button>`
              : html`<span class="hint">${s0.fileName ? '♪ ' + s0.fileName + ' · ' : ''}${t('form.songFileHint')}</span>`}
          </div>
        </div>
        <details class="advanced">
          <summary>${t('adv.title')}<span class="hint">${t('adv.hint')}</span></summary>
          <div class="adv-body">
            <div class="row">
              <label>${t('form.artist')}<input type="text" maxLength="120" value=${f.artist} onChange=${e => set('artist', e.target.value)}/></label>
              <label>${t('form.year')}<input type="text" maxLength="12" inputMode="numeric" value=${f.year} onChange=${e => set('year', e.target.value)}/></label>
            </div>
            <label>${t('adv.energy', { n: Math.round(energy * 100) })}${energyNote}
              <input type="range" min="0" max="1" step=".05" value=${energy} onChange=${e => setManualEnergy(+e.target.value)}/></label>
            ${manualEnergy != null && html`<button type="button" class="link-btn" onClick=${() => setManualEnergy(null)}>${t('adv.reset')}</button>`}
            <label>${t('adv.start')}<span class="hint">${t('adv.startHint')}</span>
              <input type="text" inputMode="numeric" maxLength="6" placeholder="0:00" value=${f.start} onChange=${e => set('start', e.target.value)}/></label>
          </div>
        </details>
        ${err && html`<div class="err" role="alert">${err}</div>`}
        <div class="bar">
          <button type="button" class="btn" disabled=${busy} onClick=${submit}>${busy ? t('form.busy') : init ? t('form.saveEdit') : t('form.save')}</button>
          ${onCancel && html`<button type="button" class="btn ghost" onClick=${onCancel}>${t('cancel')}</button>`}
        </div>
      </div>
    </div>
  </div>`;
}
