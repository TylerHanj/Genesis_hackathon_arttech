/* Папка дня: кадр, песня, текст, озвучка, объяснение. */
import { html, useState, useEffect } from '../lib/react.js';
import { ls } from '../lib/util.js';
import { useVoices, vScore, speak, stopSpeak, textLang } from '../lib/voice.js';
import { moodSector, isMood } from '../core/analysis.js';
import { useT } from '../i18n/index.js';
import { Scene } from './Scene.js';
import { Player } from './Player.js';
import { DayForm } from './DayForm.js';
import { MoodFace } from './MoodFace.js';
import { Ingredients } from './Ingredients.js';
import { Icon } from './Icons.js';

/* where: { name, by, n, sector } — в каком круге лежит воспоминание и почему (см. makeSorter) */
function whereText(w, t) {
  if (!w) return '';
  if (w.by === 'none' || !w.name) return t('where.none');
  if (w.by === 'manual') return t('where.manual', { name: w.name });
  if (w.by === 'name') return t('where.name', { name: w.name });
  if (w.by === 'like') return t('where.like', { name: w.name, n: w.n, memories: t.plural('memories', w.n) });
  return t(w.by === 'near' ? 'where.near' : 'where.mood', { name: w.name, sector: t('sector.' + w.sector) });
}

export function Folder({ d, where, onBack, onSave, onDelete }) {
  const t = useT();
  const st = d.style, s = d.song;
  const [edit, setEdit] = useState(false), [ask, setAsk] = useState(false);
  const voices = useVoices(textLang(d.text)), [vn, setVn] = useState(ls.get('dd-voice', ''));
  useEffect(() => stopSpeak, []);
  useEffect(() => {                                   // фон мягко светится цветом дня (статичный градиент, см. app.css)
    const root = document.documentElement; root.style.setProperty('--day-glow', st.sa);
    return () => root.style.removeProperty('--day-glow');
  }, [st.sa]);
  const sorted = [...voices].sort((a, b) => vScore(b) - vScore(a)), voice = sorted.find(v => v.name === vn) || sorted[0];
  if (edit) return html`<${DayForm} init=${d} onSave=${x => { onSave(x); setEdit(false); }} onCancel=${() => setEdit(false)}/>`;
  const mus = [s.artist, s.year].filter(Boolean).join(', ');
  return html`<div class="folder">
    <button class="btn ghost" onClick=${onBack}>← ${t('folder.back')}</button>
    <div class="split">
      <div><${Scene} d=${d}/><div class="player-wrap"><${Player} s=${s}/></div></div>
      <div>
        <p class="meta">${t.date(d.date)}${mus ? '  ·  ♪ ' + mus : ''}${isMood(d.mood) ? html`<span class="mood-chip"><${MoodFace} v=${d.mood.valence} e=${d.mood.energy}/>${t('sector.' + moodSector(d.mood.valence, d.mood.energy))}</span>` : ''}</p>
        <h2 class="folder-title">${d.title}</h2>
        ${where && html`<p class="where"><${Icon} name="bubble" size=${16}/>${whereText(where, t)}</p>`}
        <blockquote class="story">${d.text}</blockquote>
        <div class="bar">
          <button class="btn" onClick=${() => speak(d, voice)}>${t('folder.speak')}</button>
          <button class="btn ghost" onClick=${stopSpeak}>${t('folder.stop')}</button>
          <button class="btn ghost" onClick=${() => setEdit(true)}>${t('folder.edit')}</button>
          ${ask
            ? html`<span>${t('folder.confirmDelete')}</span><button class="btn danger" onClick=${() => onDelete(d.id)}>${t('folder.yesDelete')}</button><button class="btn ghost" onClick=${() => setAsk(false)}>${t('cancel')}</button>`
            : html`<button class="btn ghost" onClick=${() => setAsk(true)}>${t('folder.delete')}</button>`}
        </div>
        ${sorted.length > 0 && html`<label class="voice-pick">${t('folder.voice')}
          <select value=${voice ? voice.name : ''} onChange=${e => { setVn(e.target.value); ls.set('dd-voice', e.target.value); }}>
            ${sorted.map(v => html`<option key=${v.name} value=${v.name}>${v.name}</option>`)}</select>
          <span class="hint">${t('folder.voiceHint')}</span></label>`}
        <${Ingredients} d=${d}/>
      </div>
    </div>
  </div>`;
}
