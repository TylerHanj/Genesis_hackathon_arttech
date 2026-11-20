/* =====================================================================
   Боковая панель главной страницы (D1). Каркас: блоки описаны в массиве BLOCKS,
   новый блок = новый элемент { id, title, render }. Содержимое временное (TODO(audit): уточнить у заказчика).
   ===================================================================== */
import { html } from '../lib/react.js';
import { parseLocalDate } from '../lib/util.js';
import { quadrant, placeOf } from '../core/analysis.js';
import { parseTrackLink, SOURCE_LABEL } from '../lib/links.js';
import { useT } from '../i18n/index.js';

function MoodWeek({ days, t }) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const from = new Date(now); from.setDate(from.getDate() - 6);
  const week = days.filter(d => { const x = parseLocalDate(d.date); return x && x >= from && x <= now; });
  if (!week.length) return html`<p class="muted small">${t('side.moodWeekNone')}</p>`;
  const aro = week.reduce((s, d) => s + d.style.aro, 0) / week.length, val = week.reduce((s, d) => s + d.style.val, 0) / week.length;
  return html`<div class="mood-week">
    <div class="mood-dot" aria-hidden="true"><i style=${{ left: `${val * 100}%`, bottom: `${aro * 100}%` }}></i></div>
    <div><b>${t('q.' + quadrant(aro, val))}</b><span class="muted small">${t('side.moodWeekDays', { n: week.length, days: t.plural('days', week.length) })}</span></div>
  </div>`;
}

function RecentTracks({ days, t, onOpen }) {
  const withSong = [...days].filter(d => d.song && (d.song.link || d.song.artist || d.song.fileName))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  if (!withSong.length) return html`<p class="muted small">${t('side.empty')}</p>`;
  return html`<ul class="side-list">${withSong.map(d => {
    const p = d.song.link ? parseTrackLink(d.song.link) : null;
    const label = d.song.artist || (p ? SOURCE_LABEL[p.source] : d.song.fileName) || '♪';
    return html`<li key=${d.id}><button class="linkish" onClick=${() => onOpen(d.id)}><span class="note" aria-hidden="true">♪</span><span><b>${label}</b><small>${d.title}</small></span></button></li>`;
  })}</ul>`;
}

function Places({ days, t }) {
  const n = {};
  days.forEach(d => { const p = placeOf(d.text); if (p) n[p] = (n[p] || 0) + 1; });
  const top = Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!top.length) return html`<p class="muted small">${t('side.empty')}</p>`;
  return html`<ul class="chips">${top.map(([k, c]) => html`<li key=${k}>${t('place.' + k)} <small>${c}</small></li>`)}</ul>`;
}

const BLOCKS = [
  { id: 'mood', title: 'side.moodWeek', render: p => html`<${MoodWeek} ...${p}/>` },
  { id: 'tracks', title: 'side.recentTracks', render: p => html`<${RecentTracks} ...${p}/>` },
  { id: 'places', title: 'side.places', render: p => html`<${Places} ...${p}/>` },
];

export function SidePanel({ days, onOpen, idPrefix = 'sp' }) {
  const t = useT();
  return html`<section class="side-panel" aria-label=${t('side.label')}>
    ${BLOCKS.map(b => html`<div key=${b.id} class="side-block" aria-labelledby=${`${idPrefix}-${b.id}`}>
      <h2 id=${`${idPrefix}-${b.id}`}>${t(b.title)}</h2>${b.render({ days, t, onOpen })}
    </div>`)}
  </section>`;
}
