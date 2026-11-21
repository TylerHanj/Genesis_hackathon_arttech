/* Плеер песни дня. Адрес плеера строится только из разобранной ссылки (links.js).
   autoPlay: музыка, которую поставил пользователь, стартует сразу при открытии дня.
   - свой файл и прямая ссылка на mp3 — <audio autoplay> + явный play();
   - YouTube — autoplay=1 и команда playVideo через postMessage (enablejsapi);
   - SoundCloud — auto_play=true;
   - Spotify — официальный iFrame API (controller.play());
   - Яндекс Музыка и Apple Music не дают запускать себя снаружи — там остаётся кнопка ▶ в плеере. */
import { html, useEffect, useRef, useState } from '../lib/react.js';
import { parseTrackLink } from '../lib/links.js';
import { useT } from '../i18n/index.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation';
const ALLOW = 'autoplay; encrypted-media; picture-in-picture; clipboard-write';

function embedSrc(p, start, autoPlay) {
  let src = p.embed.src;
  if (p.source === 'youtube') {
    if (start) src += `&start=${start}`;
    if (autoPlay) src += `&autoplay=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  } else if (p.source === 'soundcloud' && autoPlay) src += '&auto_play=true';
  return src;
}

function Audio({ src, start, autoPlay, label }) {
  const ref = useRef(null);
  const seek = e => { const a = e.currentTarget; if (start && start < (a.duration || Infinity)) a.currentTime = start; };
  useEffect(() => {
    const a = ref.current; if (!a || !autoPlay) return undefined;
    const go = () => { const r = a.play(); if (r && r.catch) r.catch(() => {}); };   // если браузер запретил — останется кнопка ▶
    if (a.readyState >= 2) go(); else a.addEventListener('canplay', go, { once: true });
    return () => { a.removeEventListener('canplay', go); a.pause(); };
  }, [src, autoPlay]);
  return html`<audio ref=${ref} class="audio" controls loop autoPlay=${autoPlay} preload=${autoPlay ? 'auto' : 'none'} src=${src} onLoadedMetadata=${seek} aria-label=${label}></audio>`;
}

/* Spotify iFrame API: https://developer.spotify.com/documentation/embeds/references/iframe-api */
let spotifyApi = null;
function loadSpotify() {
  if (spotifyApi) return spotifyApi;
  spotifyApi = new Promise((ok, fail) => {
    window.onSpotifyIframeApiReady = api => ok(api);
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1'; s.async = true; s.onerror = () => { spotifyApi = null; fail(new Error('spotify')); };
    document.head.appendChild(s);
  });
  return spotifyApi;
}

function SpotifyAuto({ p, fallback }) {
  const host = useRef(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let ctl = null, dead = false;
    const slot = document.createElement('div'); host.current.appendChild(slot);
    loadSpotify().then(api => {
      if (dead) return;
      const [kind, id] = p.id.split(':');
      api.createController(slot, { uri: `spotify:${kind}:${id}`, width: '100%', height: p.embed.height }, c => {
        ctl = c;
        c.addListener('ready', () => { try { c.play(); } catch (e) {} });
      });
    }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; try { ctl && ctl.destroy(); } catch (e) {} if (slot.parentNode) slot.parentNode.removeChild(slot); };
  }, [p.id]);
  return failed ? fallback : html`<div class="spotify-auto" ref=${host}></div>`;
}

export function Player({ s, autoPlay = false }) {
  const t = useT();
  if (!s) return null;
  const start = s.start > 0 ? s.start : 0, label = t('player.title');
  if (s.fileUrl) return html`<${Audio} src=${s.fileUrl} start=${start} autoPlay=${autoPlay} label=${label}/>`;
  const p = s.link ? parseTrackLink(s.link) : null;
  if (p && p.audio) return html`<${Audio} src=${p.audio} start=${start} autoPlay=${autoPlay} label=${label}/>`;
  if (p && p.embed) {
    const frame = html`<iframe src=${embedSrc(p, start, autoPlay)} height=${p.embed.height} title=${label} loading=${autoPlay ? 'eager' : 'lazy'}
        sandbox=${SANDBOX} allow=${ALLOW}
        referrerpolicy="strict-origin-when-cross-origin"
        onLoad=${p.source === 'youtube' && autoPlay ? e => { try { e.currentTarget.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', 'https://www.youtube-nocookie.com'); } catch (x) {} } : undefined}></iframe>`;
    return html`<div class="player">
      ${p.source === 'spotify' && autoPlay ? html`<${SpotifyAuto} p=${p} fallback=${frame}/>` : frame}
      <a class="small-link" href=${p.open} target="_blank" rel="noopener noreferrer">${t('player.open')} ↗</a>
    </div>`;
  }
  if (s.fileName) return html`<p class="muted small">♪ ${s.fileName}. ${t('player.fileGone')}</p>`;
  return null;
}
