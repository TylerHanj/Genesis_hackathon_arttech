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
import { checkAudio, prepImage } from '../lib/files.js';
import { parseTrackLink } from '../lib/links.js';
import { makeDay, DEFAULT_SONG, moodToMusicParams, isMood, genreProfile, eraOf } from '../core/analysis.js';
import { analyzeAudioFile, analyzeAudioBuffer, combineSongData } from '../core/audio.js';
import { fetchSongMeta, fetchPreview } from '../lib/musicmeta.js';
import { ContextBlock } from './ContextBlock.js';
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
    songTitle: s0.title || '', genre: s0.genre || '', cover: s0.cover || '',
    title: init && init.manualTitle ? init.title : '',
  });
  const [mood, setMood] = useState(init && isMood(init.mood) ? init.mood : null);
  const [items, setItems] = useState(() => (init ? init.photos.map((p, i) => ({ key: 'keep-' + i, kind: 'keep', url: p.url, p })) : []));
  const [audio, setAudio] = useState(null), [manualEnergy, setManualEnergy] = useState(null);
  const [an, setAn] = useState(s0.an && s0.an.src === 'audio' ? s0.an : null), [listening, setListening] = useState(false);
  const [meta, setMeta] = useState(null), [metaState, setMetaState] = useState(s0.title ? 'accepted' : 'idle');
  const [metaLink, setMetaLink] = useState(s0.title ? (s0.link || '') : '');   // для какой ссылки описание уже принято/отклонено
  /* данные о песне по ссылке из открытых источников: фрагмент песни (темп, лад, энергия) и темп из Deezer */
  const [linkAn, setLinkAn] = useState(s0.an && (s0.an.src === 'preview' || s0.an.src === 'db') ? s0.an : null), [linkBusy, setLinkBusy] = useState(false);
  const linkRef = useRef((s0.link || '').trim());
  const [ctx, setCtx] = useState(init && init.ctx ? init.ctx : {});
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const itemsRef = useRef(items); itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach(x => x.kind === 'file' && URL.revokeObjectURL(x.url)), []);

  /* Параметры песни: сначала сама песня (анализ звука файла → жанр из описания), потом настроение, потом прежние значения. */
  const fromMood = mood ? moodToMusicParams(mood.valence, mood.energy) : null, prof = genreProfile(f.genre);
  const moodMode = fromMood ? fromMood.mode : (s0.mode || DEFAULT_SONG.mode);
  let base, src;
  if (an && an.bpm) { base = { bpm: an.bpm, mode: an.mu ? moodMode : an.mode, energy: an.energy }; src = 'audio'; }   // лад неясен — по настроению
  else if (linkAn && linkAn.bpm) {                                  // фрагмент: свой лад; только Deezer: лад по настроению
    base = { bpm: linkAn.bpm, mode: linkAn.src === 'preview' && !linkAn.mu ? linkAn.mode : moodMode, energy: linkAn.energy != null ? linkAn.energy : (prof ? prof.energy : DEFAULT_SONG.energy) };
    src = linkAn.src;
  }
  else if (prof) { base = { bpm: prof.bpm, energy: prof.energy, mode: fromMood ? fromMood.mode : (s0.mode || DEFAULT_SONG.mode) }; src = 'meta'; }
  else if (fromMood) { base = fromMood; src = 'mood'; }
  else { base = { bpm: s0.bpm || DEFAULT_SONG.bpm, mode: s0.mode || DEFAULT_SONG.mode, energy: s0.energy == null ? DEFAULT_SONG.energy : s0.energy }; src = ''; }
  const energy = manualEnergy != null ? manualEnergy : base.energy;
  const energyNote = manualEnergy != null ? t('adv.manual') : src === 'audio' ? t('form.measured') : src === 'preview' ? t('adv.fromPreview') : src === 'db' ? t('adv.fromDeezer')
    : src === 'meta' ? t('adv.fromGenre') : src === 'mood' ? t('adv.auto') : '';
  const era = eraOf(f.year);
  const muHow = t(mood ? 'audio.muMood' : 'audio.muDefault', { mode: base.mode === 'minor' ? t('form.minor') : t('form.major') });   // лад по звуку неясен — откуда он взят

  async function pickAudio(e) {
    const a = e.target.files[0]; setErr(''); e.target.value = '';
    if (!a) return;
    const c = await checkAudio(a);
    if (!c.ok) { setErr(c.code === 'size' ? t('form.audioSize', { name: c.name, mb: c.mb }) : t('form.audioType', { name: c.name })); return; }
    setAudio(a); setAn(null); setListening(true);
    try { setAn(await analyzeAudioFile(a)); } catch (x) { /* не удалось разобрать звук — останутся значения по настроению */ }
    setListening(false);
  }

  /* Описание песни по ссылке (если развёрнута функция music-meta): предлагаем, пользователь подтверждает */
  useEffect(() => {
    linkRef.current = f.link.trim();
    if (f.link.trim() !== metaLink) setLinkAn(null);                        // другая песня — прежний анализ не подходит
    const p = parseTrackLink(f.link.trim());
    if (!p || p.source === 'url' || f.link.trim() === metaLink) return undefined;
    let alive = true;
    const tm = setTimeout(async () => {
      setMetaState('loading');
      const m = await fetchSongMeta(f.link.trim());
      if (!alive) return;
      setMeta(m); setMetaState(m ? 'found' : 'idle');
    }, 700);
    return () => { alive = false; clearTimeout(tm); };
  }, [f.link]);
  const acceptMeta = () => {
    const m = meta, link = f.link.trim();
    setF(o => ({ ...o, songTitle: m.title, artist: m.artist || o.artist, year: m.year || o.year, genre: m.genre, cover: m.cover })); setMetaState('accepted'); setMeta(null); setMetaLink(link);
    listenLink(m, link);
  };
  /* После подтверждения: слушаем 30-секундный фрагмент (темп, лад, тональность, энергия) и сверяем темп с Deezer. */
  async function listenLink(m, link) {
    if (!m.preview && !m.bpm) return;
    setLinkAn(null); setLinkBusy(true);
    let a = null;
    if (m.preview) {
      const buf = await fetchPreview(m.preview);
      if (buf) { try { a = await analyzeAudioBuffer(buf); } catch (x) { a = null; } }   // не удалось декодировать — останется темп из Deezer
    }
    const r = combineSongData(a, { bpm: m.bpm, gain: m.gain });
    if (linkRef.current === link) setLinkAn(r);
    setLinkBusy(false);
  }
  const files = items.filter(x => x.kind === 'file').map(x => x.file);

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
      const { key: anKey, mu: anMu, ...anRest } = an || {};
      const songAn = src === 'audio' ? { ...anRest, mode: base.mode, src: 'audio', ...(anMu ? { mu: true } : anKey ? { key: anKey } : {}) }
        : src === 'preview' || src === 'db' ? { bpm: base.bpm, mode: base.mode, energy: base.energy, src, ...(linkAn.key && !linkAn.mu ? { key: linkAn.key } : {}),
          ...(linkAn.bright != null ? { bright: linkAn.bright } : {}), ...(linkAn.conf != null ? { conf: linkAn.conf } : {}), ...(linkAn.dz ? { dz: true } : {}), ...(linkAn.mu ? { mu: true } : {}) }
        : src === 'meta' ? { bpm: base.bpm, mode: base.mode, energy: base.energy, src: 'meta' } : null;
      const day = makeDay({
        id: init && init.id, date: f.date, text: f.text.slice(0, 20000), photos, mood, ctx, customTitle: f.title.trim().slice(0, 140), newId: uid,
        song: {
          link, artist: f.artist.slice(0, 120), year: f.year.slice(0, 12), title: f.songTitle.slice(0, 140), bpm: base.bpm, mode: base.mode, energy: +energy, start,
          ...(f.genre ? { genre: f.genre.slice(0, 60) } : {}), ...(f.cover ? { cover: f.cover } : {}), ...(songAn ? { an: songAn } : {}),
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
          ${metaState === 'loading' && html`<p class="hint" role="status">${t('meta.loading')}</p>`}
          ${metaState === 'found' && meta && html`<div class="meta-card" role="group" aria-label=${t('meta.found')}>
            ${meta.cover ? html`<img src=${meta.cover} alt="" width="48" height="48" loading="lazy" referrerpolicy="no-referrer"/>` : html`<span class="cover-ph" aria-hidden="true">♪</span>`}
            <div><span class="hint">${t('meta.found')}</span><b>${meta.title}</b><small>${[meta.artist, meta.year, meta.genre].filter(Boolean).join(' · ')}</small></div>
            <div class="bar"><button type="button" class="btn" onClick=${acceptMeta}>${t('meta.accept')}</button>
              <button type="button" class="btn ghost" onClick=${() => { setMeta(null); setMetaState('rejected'); setMetaLink(f.link.trim()); }}>${t('meta.reject')}</button></div>
          </div>`}
          ${metaState === 'accepted' && f.songTitle && html`<p class="hint">♪ ${[f.songTitle, f.artist, f.year, f.genre].filter(Boolean).join(' · ')}</p>`}
          ${linkBusy && html`<p class="hint" role="status">${t('audio.analyzingLink')}</p>`}
          ${!linkBusy && !(an && an.bpm) && linkAn && linkAn.bpm > 0 && html`<p class="audio-an" role="status">${linkAn.src === 'preview'
            ? (linkAn.mu ? t('audio.resultLinkMu', { bpm: linkAn.bpm, how: muHow, e: Math.round(base.energy * 100) })
              : t('audio.resultLink', { bpm: linkAn.bpm, mode: linkAn.mode === 'minor' ? t('form.minor') : t('form.major'), key: linkAn.key || '', e: Math.round(base.energy * 100) })) + (linkAn.dz ? t('audio.dz') : '')
            : t('audio.resultDb', { bpm: linkAn.bpm, e: Math.round(base.energy * 100) })}</p>`}
          <div class="audio-pick">
            <label class="btn ghost file-btn">${t('audio.choose')}
              <input class="sr-only" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.m4a,.ogg" onChange=${pickAudio}/></label>
            ${audio
              ? html`<span class="file-name">♪ ${audio.name}</span><button type="button" class="link-btn" onClick=${() => { setAudio(null); setAn(null); }}>${t('audio.remove')}</button>`
              : html`<span class="hint">${s0.fileName ? '♪ ' + s0.fileName + ' · ' : ''}${t('form.songFileHint')}</span>`}
          </div>
          ${listening && html`<p class="hint" role="status">${t('audio.analyzing')}</p>`}
          ${an && an.bpm > 0 && html`<p class="audio-an" role="status">${an.mu
            ? t('audio.resultMu', { bpm: an.bpm, how: muHow, e: Math.round(an.energy * 100) })
            : t('audio.result', { bpm: an.bpm, mode: an.mode === 'minor' ? t('form.minor') : t('form.major'), key: an.key || '', e: Math.round(an.energy * 100) })}</p>`}
        </div>
        <${ContextBlock} value=${ctx} onChange=${setCtx} date=${f.date} setDate=${d => set('date', d)} files=${files}/>
        <details class="advanced">
          <summary>${t('adv.title')}<span class="hint">${t('adv.hint')}</span></summary>
          <div class="adv-body">
            <label>${t('meta.title')}<input type="text" maxLength="140" value=${f.songTitle} onChange=${e => set('songTitle', e.target.value)}/></label>
            <div class="row">
              <label>${t('form.artist')}<input type="text" maxLength="120" value=${f.artist} onChange=${e => set('artist', e.target.value)}/></label>
              <label>${t('form.year')}<input type="text" maxLength="12" inputMode="numeric" value=${f.year} onChange=${e => set('year', e.target.value)}/></label>
            </div>
            ${era && html`<p class="era-hint">${t('ing.era', { era: t('era.' + era) })} → ${t('eraFx.' + era)}</p>`}
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
