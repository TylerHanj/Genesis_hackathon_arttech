/* =====================================================================
   «Как собран этот день»: из чего сложилось воспоминание и на что каждое повлияло.
   Текст → настроение, места, люди, события, сезон и время; фото → главные цвета, свет, примерный сюжет;
   музыка → темп, лад, энергия, эпоха; контекст (по согласию) → погода, место, день недели.
   Всё выводится текстом через React; цвета — только проверенные hex из safe.js.
   ===================================================================== */
import { html, useState } from '../lib/react.js';
import { parseLocalDate } from '../lib/util.js';
import { analyze, explain, MOODS, voiceKeyOf, eraOf } from '../core/analysis.js';
import { useT } from '../i18n/index.js';
import { Icon, WeatherIcon } from './Icons.js';

function palette(photos) {
  const all = [];
  photos.forEach(p => (p.dom || []).forEach(([c, s]) => all.push([c, s / photos.length])));
  if (!all.length) return null;
  const top = all.sort((a, b) => b[1] - a[1]).slice(0, 5), sum = top.reduce((s, x) => s + x[1], 0) || 1;
  return top.map(([c, s]) => [c, Math.round(s / sum * 100)]);
}

function Row({ icon, title, sub, children }) {
  return html`<div class="ing-row">
    <div class="ing-head"><${Icon} name=${icon}/><span>${title}${sub && html`<small>${sub}</small>`}</span></div>
    <div class="ing-body">${children}</div>
  </div>`;
}
const Chip = ({ on, icon, children }) => html`<span class=${'c' + (on ? '' : ' o')}>${icon && html`<${Icon} name=${icon} size=${14}/>`}${children}</span>`;
const Eff = ({ children }) => html`<p class="eff">→ ${children}</p>`;

export function Ingredients({ d }) {
  const t = useT();
  const [more, setMore] = useState(false);
  const A = analyze({ text: d.text, photos: d.photos, song: d.song, mood: d.mood, date: d.date, ctx: d.ctx });
  const st = d.style, s = d.song || {}, fx = st.fx || {}, n = d.photos.length;
  const moods = MOODS.filter(k => A.sc[k] > 0);
  const pal = palette(d.photos);
  const fresh = d.photos.filter(p => p.dom);
  const lum = fresh.length ? fresh.reduce((a, p) => a + p.lum, 0) / fresh.length : A.ph.l;
  const con = fresh.length ? fresh.reduce((a, p) => a + p.con, 0) / fresh.length : null;
  const light = [con != null && (con < .25 ? t('ing.soft') : con > .45 ? t('ing.contrasty') : null), lum > .6 ? t('ing.bright') : lum < .35 ? t('ing.dim') : null,
    A.ph.w > .05 ? t('ing.warm') : A.ph.w < -.05 ? t('ing.cool') : null].filter(Boolean);
  const hasSong = !!(s.link || s.fileName || s.title || s.artist);
  const an = s.an, srcKey = an ? 'ing.src.' + an.src : d.mood ? 'ing.src.mood' : null;
  const era = fx.era || eraOf(s.year);
  const day = parseLocalDate(d.date);
  const weekday = day ? day.toLocaleDateString(t.locale, { weekday: 'long' }) : null;
  const ctx = d.ctx || {}, wx = ctx.weather, textWeather = !wx && A.weather && A.weather.src === 'text' ? A.weather.kind : null;
  const timeNote = A.timeSrc === 'photo' ? ` (${t('ing.byPhoto')})` : '', seasonNote = A.seasonSrc === 'date' ? ` (${t('ing.byDate')})` : '';

  return html`<section class="card ing" aria-labelledby="ing-h">
    <h3 id="ing-h">${t('ing.title')}</h3>

    <${Row} icon="text" title=${t('ing.text')} sub=${t('ing.textSub')}>
      <div class="chips2">
        ${moods.map(k => html`<${Chip} key=${k} on=${true}>${t('mood.' + k)}<//>`)}
        ${A.place && html`<${Chip} icon="pin">${t('place.' + A.place[1])}<//>`}
        ${A.people.map(k => html`<${Chip} key=${k} icon="people">${t('people.' + k)}<//>`)}
        ${A.events.map(k => html`<${Chip} key=${k}>${t('event.' + k)}<//>`)}
        ${A.season && html`<${Chip}>${t('season.' + A.season[0])}${seasonNote}<//>`}
        <${Chip}>${t('time.' + A.timeE[0])}${timeNote}<//>
      </div>
      <${Eff}><b>${t('ing.effText')}</b>${st.dark && A.timeE[0] === 'night' ? '; ' + t('ing.effNight') : ''}<//>
    <//>

    <${Row} icon="camera" title=${t('ing.photo')} sub=${`${n} ${t.plural('frames', n)}`}>
      ${pal
        ? html`<div class="pal" role="img" aria-label=${pal.map(([, p]) => p + '%').join(', ')}>${pal.map(([c, p], i) => html`<span key=${i} style=${{ flexGrow: p, background: c }}>${p >= 9 ? p + '%' : ''}</span>`)}</div>`
        : html`<div class="pal"><span style=${{ flexGrow: 1, background: st.s1 }}></span><span style=${{ flexGrow: 1, background: st.sa }}></span></div>`}
      <div class="meter"><span>${t('ing.light')}</span><i style=${{ '--v': Math.round(lum * 100) + '%' }}></i><span>${light.join(', ')}</span></div>
      ${A.tags.length > 0 && html`<div class="chips2"><span class="likely">${t('ing.likely')}</span>${A.tags.map(k => html`<${Chip} key=${k}>${t('scene.' + k)}<//>`)}</div>`}
      <${Eff}>${fresh.length ? t('ing.effPhoto', { n, frames: t.plural('frames', n), sec: t.num(st.sec, { maximumFractionDigits: 1 }) }) : t('ing.effPhotoOld')}<//>
    <//>

    <${Row} icon="note" title=${t('ing.music')} sub=${t('ing.musicSub')}>
      ${hasSong ? html`
        <div class="song-line">
          ${s.cover ? html`<img class="cover" src=${s.cover} alt="" width="40" height="40" loading="lazy" referrerpolicy="no-referrer"/>` : html`<span class="cover ph" aria-hidden="true">♪</span>`}
          <span><b>${s.title || s.artist || s.fileName || t('player.title')}</b><br/>
            <span class="src">${[s.title && s.artist, s.year, s.genre, srcKey && t(srcKey), an && an.dz && an.src === 'preview' && t('ing.dz')].filter(Boolean).join(' · ')}</span></span>
        </div>
        <div class="chips2">
          <${Chip} on=${true}>${!an || an.src === 'meta' ? '≈' : ''}${A.sg.bpm} BPM<//>
          <${Chip} on=${true}>${A.maj ? t('form.major') : t('form.minor')}${an && an.key && !an.mu ? ' (' + an.key + ')' : ''}${(an && an.mu) || (!an && d.mood) ? ' — ' + t('ing.modeByMood') : ''}<//>
          <${Chip} on=${true}>${t('ing.energy', { n: Math.round(A.sg.energy * 100) })}<//>
          ${an && (an.src === 'audio' || an.src === 'preview') && html`<${Chip}>${an.bright > .5 ? t('ing.brightSound') : t('ing.darkSound')}<//>`}
          ${era && html`<${Chip}>${t('ing.era', { era: t('era.' + era) })}<//>`}
        </div>
        <${Eff}><b>${t('ing.effMusic')}</b>${era ? html`; ${t('era.' + era)} — <b>${t('eraFx.' + era)}</b>` : ''}<//>`
      : html`<p class="eff">${t('ing.noSong')}</p>`}
    <//>

    <${Row} icon="cloud" title=${t('ing.ctx')} sub=${t('ing.ctxSub')}>
      <div class="chips2">
        ${weekday && html`<${Chip}>${weekday}<//>`}
        ${wx && html`<${Chip}><${WeatherIcon} kind=${wx.kind} size=${14}/>${wx.t != null ? (wx.t > 0 ? '+' : '') + wx.t + '° · ' : ''}${t('weather.' + wx.kind)}<//>`}
        ${textWeather && html`<${Chip}><${WeatherIcon} kind=${textWeather} size=${14}/>${t('weather.' + textWeather)} (${t('ing.fromText')})<//>`}
        ${ctx.place && html`<${Chip} icon="pin">${ctx.place}<//>`}
      </div>
      ${fx.weather ? html`<${Eff}><b>${t('weatherFx.' + fx.weather)}</b><//>` : !wx && !ctx.place ? html`<p class="eff">${t('ing.ctxNone')}</p>` : null}
    <//>

    <div class="why-toggle"><button class="btn ghost" aria-expanded=${more} onClick=${() => setMore(!more)}>${more ? t('folder.hideWhy') : t('ing.details')}</button></div>
    ${more && html`<div class="why-card">
      <h4>${t(`tech.${st.tech}.name`)}</h4>
      <ul class="why">${explain(d, t).map((w, k) => html`<li key=${k}>${w}</li>`)}</ul>
      <div class="swatches" aria-label=${t('folder.palette')}>${[st.s1, st.s2, st.sa, st.si].map((c, k) => html`<span key=${k} style=${{ background: c }}></span>`)}</div>
      <ul class="files">
        <li>${t('folder.fileText')}</li><li>${t('folder.filePhotos', { n })}</li>
        <li>${t('folder.fileSong', { s: s.fileName || s.link || [s.artist, s.year].filter(Boolean).join(', ') || '—' })}</li><li>${t('folder.fileMemory')}</li>
        <li>${t('folder.fileVoice', { d: t('voice.' + voiceKeyOf(st)) })}</li>
      </ul>
    </div>`}
  </section>`;
}
