/* =====================================================================
   Плеер песни дня + громкость (C2).
   Адрес плеера строится только из разобранной ссылки (links.js).
   Громкость: по умолчанию 40 %, запоминается (localStorage, не секрет), кнопка «без звука»,
   плавное нарастание при старте.
   - аудиофайл и mp3-ссылка — свойство volume элемента <audio>;
   - YouTube и SoundCloud — команды через postMessage их официальных встроенных плееров
     (без сторонних скриптов; сообщения принимаются только от нужного домена и своего iframe);
   - Spotify, Яндекс Музыка, Apple Music громкость извне не дают — показываем подсказку.
   ===================================================================== */
import { html, useState, useEffect, useRef } from '../lib/react.js';
import { ls, clamp } from '../lib/util.js';
import { parseTrackLink, SOURCE_LABEL } from '../lib/links.js';
import { useT } from '../i18n/index.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation';
const VOL_KEY = 'dd-volume';
const FADE_MS = 1200;
const ORIGIN = { youtube: 'https://www.youtube-nocookie.com', soundcloud: 'https://w.soundcloud.com' };

function useVolume() {
  const [vol, setVol] = useState(() => { const x = ls.get(VOL_KEY, .4); return typeof x === 'number' && x >= 0 && x <= 1 ? x : .4; });
  const [muted, setMuted] = useState(false);
  useEffect(() => { ls.set(VOL_KEY, vol); }, [vol]);
  return { vol, setVol, muted, setMuted, level: muted ? 0 : vol };
}

/* Плавное нарастание: вызывает apply(0 → target) за FADE_MS. Возвращает функцию отмены. */
function fade(target, apply) {
  let raf = 0; const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / FADE_MS); apply(target * k * k); if (k < 1) raf = requestAnimationFrame(step); };
  apply(0); raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

function Speaker({ level }) {
  const waves = level <= 0 ? html`<path d="M15.5 9.5l5 5m0-5l-5 5"/>` : level < .5 ? html`<path d="M15.5 9.2a4 4 0 0 1 0 5.6"/>`
    : html`<path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>`;
  return html`<svg class="vol-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="spk" d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/>${waves}</svg>`;
}

function VolumeControl({ v, t }) {
  const pct = Math.round(v.vol * 100), shown = v.muted ? 0 : pct;
  return html`<div class="vol">
    <button type="button" class="vol-mute" aria-pressed=${v.muted} aria-label=${v.muted ? t('vol.unmute') : t('vol.mute')} title=${v.muted ? t('vol.unmute') : t('vol.mute')}
      onClick=${() => v.setMuted(!v.muted)}><${Speaker} level=${v.level}/></button>
    <input type="range" class="vol-range" min="0" max="100" step="1" value=${shown} style=${{ '--p': shown + '%' }}
      aria-label=${t('vol.label')} aria-valuetext=${shown + '%'}
      onInput=${e => { v.setVol(+e.target.value / 100); if (v.muted) v.setMuted(false); }} onChange=${() => {}}/>
    <span class="vol-val" aria-hidden="true">${shown}%</span>
  </div>`;
}

/* <audio>: громкость напрямую, нарастание при каждом запуске */
function AudioPlayer({ src, start, t, preload }) {
  const v = useVolume(), el = useRef(null), stopFade = useRef(null);
  const target = useRef(v.level); target.current = v.level;
  useEffect(() => { if (stopFade.current) { stopFade.current(); stopFade.current = null; } if (el.current) el.current.volume = v.level; }, [v.level]);
  const onPlay = () => {
    if (stopFade.current) stopFade.current();
    stopFade.current = fade(target.current, x => { if (el.current) el.current.volume = clamp(x); });
  };
  const onPause = () => { if (stopFade.current) { stopFade.current(); stopFade.current = null; } if (el.current) el.current.volume = target.current; };
  const seek = e => { const a = e.currentTarget; a.volume = target.current; if (start && start < (a.duration || Infinity)) a.currentTime = start; };
  return html`<div class="player">
    <audio ref=${el} class="audio" controls loop preload=${preload} src=${src} onLoadedMetadata=${seek} onPlay=${onPlay} onPause=${onPause} aria-label=${t('player.title')}></audio>
    <${VolumeControl} v=${v} t=${t}/>
  </div>`;
}

/* YouTube / SoundCloud: команды встроенным плеерам через postMessage */
function EmbedPlayer({ p, start, t }) {
  const v = useVolume(), frame = useRef(null), played = useRef(false), stopFade = useRef(null);
  const ctl = p.source === 'youtube' || p.source === 'soundcloud';
  const origin = ORIGIN[p.source];
  const send = msg => { const w = frame.current && frame.current.contentWindow; if (w && origin) w.postMessage(JSON.stringify(msg), origin); };
  const setLevel = x => {
    const n = Math.round(clamp(x) * 100);
    if (p.source === 'youtube') { send({ event: 'command', func: 'setVolume', args: [n] }); send({ event: 'command', func: n ? 'unMute' : 'mute', args: [] }); }
    else if (p.source === 'soundcloud') send({ method: 'setVolume', value: n });
  };
  const target = useRef(v.level); target.current = v.level;
  useEffect(() => { if (!ctl) return; if (stopFade.current) { stopFade.current(); stopFade.current = null; } setLevel(v.level); }, [v.level]);
  const onFirstPlay = () => { if (played.current) return; played.current = true; stopFade.current = fade(target.current, setLevel); };

  useEffect(() => {
    if (!ctl) return undefined;
    const onMsg = e => {
      if (e.origin !== origin || !frame.current || e.source !== frame.current.contentWindow) return;
      let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
      if (!d || typeof d !== 'object') return;
      if (p.source === 'youtube') {
        if (d.event === 'onReady') setLevel(target.current);
        const st = d.info && typeof d.info === 'object' ? d.info.playerState : undefined;
        if ((d.event === 'onStateChange' && d.info === 1) || st === 1) onFirstPlay();
      } else {
        if (d.method === 'ready') { setLevel(target.current); send({ method: 'addEventListener', value: 'play' }); }
        if (d.method === 'play') onFirstPlay();
      }
    };
    window.addEventListener('message', onMsg);
    return () => { window.removeEventListener('message', onMsg); if (stopFade.current) stopFade.current(); };
  }, [p.embed.src]);

  const onLoad = () => {
    if (p.source === 'youtube') { send({ event: 'listening', id: 'dd-yt', channel: 'widget' }); setTimeout(() => setLevel(target.current), 600); }
    if (p.source === 'soundcloud') { send({ method: 'addEventListener', value: 'ready' }); setTimeout(() => setLevel(target.current), 600); }
  };
  let src = p.embed.src;
  if (p.source === 'youtube') src += `&enablejsapi=1&origin=${encodeURIComponent(location.origin)}${start ? `&start=${start}` : ''}`;
  return html`<div class="player">
    <iframe ref=${frame} src=${src} height=${p.embed.height} title=${t('player.title')} loading="lazy" onLoad=${onLoad}
      sandbox=${SANDBOX} allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
      referrerpolicy="strict-origin-when-cross-origin"></iframe>
    ${ctl ? html`<${VolumeControl} v=${v} t=${t}/>` : html`<p class="vol-note">${t('vol.noControl', { service: SOURCE_LABEL[p.source] })}</p>`}
    <a class="small-link" href=${p.open} target="_blank" rel="noopener noreferrer">${t('player.open')} ↗</a>
  </div>`;
}

export function Player({ s }) {
  const t = useT();
  if (!s) return null;
  const start = s.start > 0 ? s.start : 0;
  if (s.fileUrl) return html`<${AudioPlayer} src=${s.fileUrl} start=${start} t=${t} preload="metadata"/>`;
  const p = s.link ? parseTrackLink(s.link) : null;
  if (p && p.audio) return html`<${AudioPlayer} src=${p.audio} start=${start} t=${t} preload="none"/>`;
  if (p && p.embed) return html`<${EmbedPlayer} key=${p.embed.src} p=${p} start=${start} t=${t}/>`;
  if (s.fileName) return html`<p class="muted small">♪ ${s.fileName}. ${t('player.fileGone')}</p>`;
  return null;
}
