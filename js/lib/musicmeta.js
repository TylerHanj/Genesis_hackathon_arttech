/* Описание песни по ссылке (Spotify, YouTube, SoundCloud…) через серверную функцию Supabase `music-meta`
   (supabase/functions/music-meta). Функция ходит только к фиксированным сервисам (oEmbed, iTunes Search).
   Если функция ещё не развёрнута — тихо возвращаем null, форма работает как раньше. */
import { sb } from './backend.js';

const COVER = /^https:\/\/is\d{1,2}-ssl\.mzstatic\.com\/image\/thumb\/[A-Za-z0-9/._-]{1,300}$/;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function fetchSongMeta(url) {
  if (!sb || !url) return null;
  try {
    const { data, error } = await sb.functions.invoke('music-meta', { body: { url } });
    if (error || !data || typeof data !== 'object' || !data.title) return null;
    const year = /^\d{4}$/.test(String(data.year || '')) ? String(data.year) : '';
    return { title: str(data.title, 140), artist: str(data.artist, 120), year, genre: str(data.genre, 60),
      cover: typeof data.cover === 'string' && COVER.test(data.cover) ? data.cover : '' };
  } catch (e) { return null; }
}
