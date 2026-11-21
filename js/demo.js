/* =====================================================================
   Разбор ссылок на песни. Белый список доменов, только https.
   ID трека извлекается регуляркой, а адрес плеера собирается здесь же —
   ссылка пользователя никогда не вставляется в iframe/href как есть.
   Чтобы добавить сервис, допишите элемент в SOURCES.
   ===================================================================== */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const hostIs = (h, list) => list.includes(h);

const SOURCES = [
  {
    source: 'youtube',
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'],
    parse(u) {
      let id = null;
      if (u.hostname === 'youtu.be') id = u.pathname.split('/')[1];
      else if (u.pathname === '/watch') id = u.searchParams.get('v');
      else { const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/); if (m) id = m[1]; }
      if (!id || !YT_ID.test(id)) return null;
      return { id, embed: { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, height: 210 }, open: `https://www.youtube.com/watch?v=${id}` };
    },
  },
  {
    source: 'spotify',
    hosts: ['open.spotify.com'],
    parse(u) {
      const m = u.pathname.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})\/?$/);
      if (!m) return null;
      return { id: `${m[1]}:${m[2]}`, embed: { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' || m[1] === 'episode' ? 152 : 352 }, open: `https://open.spotify.com/${m[1]}/${m[2]}` };
    },
  },
  {
    source: 'yandex',
    hosts: ['music.yandex.ru', 'music.yandex.kz', 'music.yandex.com', 'music.yandex.by', 'music.yandex.uz'],
    parse(u) {
      const m = u.pathname.match(/^\/album\/(\d{1,12})\/track\/(\d{1,12})\/?$/);
      if (!m) return null;
      return { id: `${m[1]}:${m[2]}`, embed: { src: `https://music.yandex.ru/iframe/#track/${m[2]}/${m[1]}`, height: 100 }, open: `https://music.yandex.ru/album/${m[1]}/track/${m[2]}` };
    },
  },
  {
    source: 'soundcloud',
    hosts: ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'],
    parse(u) {
      const m = u.pathname.match(/^\/([A-Za-z0-9_-]{1,100})\/((?:sets\/)?[A-Za-z0-9_-]{1,200})\/?$/);
      if (!m) return null;
      const clean = `https://soundcloud.com/${m[1]}/${m[2]}`;
      return { id: `${m[1]}/${m[2]}`, embed: { src: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(clean) + '&visual=false', height: 120 }, open: clean };
    },
  },
  {
    source: 'apple',
    hosts: ['music.apple.com'],
    parse(u) {
      const m = u.pathname.match(/^\/([a-z]{2})\/(album|song|playlist)\/([A-Za-z0-9%._-]{1,200})\/((?:pl\.)?[A-Za-z0-9.-]{1,64})\/?$/);
      if (!m) return null;
      const i = u.searchParams.get('i');
      const q = i && /^\d{1,15}$/.test(i) ? `?i=${i}` : '';
      const path = `${m[1]}/${m[2]}/${m[3]}/${m[4]}${q}`;
      return { id: path, embed: { src: `https://embed.music.apple.com/${path}`, height: q || m[2] === 'song' ? 175 : 450 }, open: `https://music.apple.com/${path}` };
    },
  },
];

const AUDIO_EXT = /\.(mp3|m4a|ogg|oga)$/i;

/* Возвращает { source, id, embed?, audio?, open } или null, если ссылка не поддерживается. */
export function parseTrackLink(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 2048) return null;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase();
  for (const src of SOURCES) {
    if (!hostIs(host, src.hosts)) continue;
    const r = src.parse(u);
    return r ? { source: src.source, ...r } : null;
  }
  // Прямая https-ссылка на аудиофайл: играет в <audio>, не исполняется.
  // TODO(audit): когда появятся публичные воспоминания (этап 3), такие ссылки раскрывают IP зрителя
  // стороннему серверу — для чужих записей показывать только после клика.
  if (AUDIO_EXT.test(u.pathname)) return { source: 'url', id: u.href, audio: u.href, open: u.href };
  return null;
}

export const SOURCE_LABEL = { youtube: 'YouTube', spotify: 'Spotify', yandex: 'Яндекс Музыка', soundcloud: 'SoundCloud', apple: 'Apple Music', url: 'mp3', upload: 'file' };
