/* Описание песни по ссылке (Spotify, YouTube, SoundCloud, Apple Music) через серверную функцию Supabase `music-meta`
   (supabase/functions/music-meta). Функция ходит только к фиксированным открытым сервисам:
   oEmbed, iTunes Search (название, год, жанр, обложка) и Deezer (темп, громкость, 30-секундный фрагмент).
   Фрагмент тоже идёт через функцию (у этих сервисов нет CORS) — по нему браузер сам определяет темп, лад и энергию.
   Если функция ещё не развёрнута — тихо возвращаем null, форма работает как раньше. */
import { sb } from './backend.js';

const COVER = /^https:\/\/is\d{1,2}-ssl\.mzstatic\.com\/image\/thumb\/[A-Za-z0-9/._-]{1,300}$/;
const PREVIEW = /^https:\/\/(?:audio-ssl\.itunes\.apple\.com\/itunes-assets\/[A-Za-z0-9/._-]{1,400}\.m4a|cdn[st]-preview(?:-[a-z0-9])?\.dzcdn\.net\/[A-Za-z0-9/._-]{1,300}\.mp3(?:\?[A-Za-z0-9=~*/._,%&+-]{0,1000})?)$/;
const MAX_AUDIO = 3000000;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const inRange = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;

export async function fetchSongMeta(url) {
  if (!sb || !url) return null;
  try {
    const { data, error } = await sb.functions.invoke('music-meta', { body: { url } });
    if (error || !data || typeof data !== 'object' || !data.title) return null;
    const year = /^\d{4}$/.test(String(data.year || '')) ? String(data.year) : '';
    return { title: str(data.title, 140), artist: str(data.artist, 120), year, genre: str(data.genre, 60),
      cover: typeof data.cover === 'string' && COVER.test(data.cover) ? data.cover : '',
      ...(inRange(data.bpm, 40, 250) ? { bpm: data.bpm } : {}), ...(inRange(data.gain, -40, 20) ? { gain: data.gain } : {}),
      ...(typeof data.preview === 'string' && data.preview.length <= 1500 && PREVIEW.test(data.preview) ? { preview: data.preview } : {}) };
  } catch (e) { return null; }
}

/* 30-секундный фрагмент → ArrayBuffer (или null). Звук не сохраняется, только анализируется. */
export async function fetchPreview(preview) {
  if (!sb || typeof preview !== 'string' || !PREVIEW.test(preview)) return null;
  try {
    const { data, error } = await sb.functions.invoke('music-meta', { body: { preview } });
    if (error || !(data instanceof Blob) || data.size < 1000 || data.size > MAX_AUDIO) return null;
    return await data.arrayBuffer();
  } catch (e) { return null; }
}
