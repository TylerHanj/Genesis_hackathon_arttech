/* Плеер песни дня. Адрес плеера строится только из разобранной ссылки (links.js). */
import { html } from '../lib/react.js';
import { parseTrackLink } from '../lib/links.js';
import { useT } from '../i18n/index.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation';

export function Player({ s }) {
  const t = useT();
  if (!s) return null;
  const start = s.start > 0 ? s.start : 0;
  const seek = e => { const a = e.currentTarget; if (start && start < (a.duration || Infinity)) a.currentTime = start; };
  if (s.fileUrl) return html`<audio class="audio" controls loop src=${s.fileUrl} onLoadedMetadata=${seek} aria-label=${t('player.title')}></audio>`;
  const p = s.link ? parseTrackLink(s.link) : null;
  if (p && p.audio) return html`<audio class="audio" controls loop preload="none" src=${p.audio} onLoadedMetadata=${seek} aria-label=${t('player.title')}></audio>`;
  if (p && p.embed) {
    return html`<div class="player">
      <iframe src=${p.embed.src + (p.source === 'youtube' && start ? `&start=${start}` : '')} height=${p.embed.height} title=${t('player.title')} loading="lazy"
        sandbox=${SANDBOX} allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
        referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <a class="small-link" href=${p.open} target="_blank" rel="noopener noreferrer">${t('player.open')} ↗</a>
    </div>`;
  }
  if (s.fileName) return html`<p class="muted small">♪ ${s.fileName}. ${t('player.fileGone')}</p>`;
  return null;
}
