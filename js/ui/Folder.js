/* Папка дня: кадр, песня, текст, озвучка, объяснение. */
import { html, useState, useEffect } from '../lib/react.js';
import { ls } from '../lib/util.js';
import { useVoices, vScore, speak, stopSpeak, textLang } from '../lib/voice.js';
import { explain, voiceKeyOf, moodSector, isMood } from '../core/analysis.js';
import { useT } from '../i18n/index.js';
import { Scene } from './Scene.js';
import { Player } from './Player.js';
import { DayForm } from './DayForm.js';
import { MoodFace } from './MoodFace.js';

export function Folder({ d, onBack, onSave, onDelete }) {
  const t = useT();
  const st = d.style, s = d.song;
  const [edit, setEdit] = useState(false), [ask, setAsk] = useState(false), [more, setMore] = useState(false);
  const voices = useVoices(textLang(d.text)), [vn, setVn] = useState(ls.get('dd-voice', ''));
  useEffect(() => stopSpeak, []);
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
        <div class="why-toggle"><button class="btn ghost" aria-expanded=${more} onClick=${() => setMore(!more)}>${more ? t('folder.hideWhy') : t('folder.why')}</button></div>
        ${more && html`<div class="card why-card">
          <h3>${t(`tech.${st.tech}.name`)}</h3>
          <ul class="why">${explain(d, t).map((w, k) => html`<li key=${k}>${w}</li>`)}</ul>
          <div class="swatches" aria-label=${t('folder.palette')}>${[st.s1, st.s2, st.sa, st.si].map((c, k) => html`<span key=${k} style=${{ background: c }}></span>`)}</div>
          <ul class="files">
            <li>${t('folder.fileText')}</li><li>${t('folder.filePhotos', { n: d.photos.length })}</li>
            <li>${t('folder.fileSong', { s: s.fileName || s.link || mus || '—' })}</li><li>${t('folder.fileMemory')}</li>
            <li>${t('folder.fileVoice', { d: t('voice.' + voiceKeyOf(st)) })}</li>
          </ul>
        </div>`}
      </div>
    </div>
  </div>`;
}
