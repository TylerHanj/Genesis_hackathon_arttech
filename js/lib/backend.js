/* =====================================================================
   Supabase: клиент, вход и хранилище дней.
   Изменения по аудиту:
   - нет тихого «демо-режима» с локальными аккаунтами: если библиотека не загрузилась, показываем ошибку (S11);
   - каждый запрос дополнительно ограничен user_id (второй рубеж после RLS, S1);
   - пользователю показываются нейтральные сообщения, технические детали — только в console (S12);
   - выход чистит данные приложения в localStorage, состояние сессии отслеживается (S14).
   ===================================================================== */
import { CONFIG } from '../config.js';
import { ls } from './util.js';
import { sanitizeDay, sanitizeCats, sanitizeLayout } from './safe.js';

/* Ссылка из письма «Сброс пароля»: Supabase возвращает на сайт с #…&type=recovery (или с ошибкой, если ссылка
   устарела или уже использована). Читаем адрес ДО создания клиента: клиент сам разберёт токены и уберёт их из адреса. */
export const urlIntent = (() => {
  try {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, '')), q = new URLSearchParams(location.search || '');
    const code = h.get('error_code') || q.get('error_code') || h.get('error') || q.get('error');
    const desc = (h.get('error_description') || q.get('error_description') || '').toLowerCase();
    const out = { recovery: h.get('type') === 'recovery' || q.get('type') === 'recovery', error: code ? (/expired|invalid/.test(code + desc) ? 'expired' : 'failed') : null };
    if (out.error) history.replaceState(null, '', location.pathname);      // не оставлять ошибку и параметры в адресе
    return out;
  } catch (e) { return { recovery: false, error: null }; }
})();

export const sb = (window.supabase && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_PUBLISHABLE_KEY)
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const META_ID = 'meta:cats';
export const META_V = 3;        // 2–3 — восемь кругов по секторам карты настроения (см. upgradeCats); поле необязательное
export const MIN_PASSWORD = 8;

/* Остатки старого локального режима (пароли-хэши) больше не нужны — удаляем при старте. */
['dd-users', 'dd-session'].forEach(k => ls.del(k));

/* Ошибка → ключ перевода. Тексты Supabase/Postgres пользователю не показываются. */
export class AppError extends Error { constructor(key, cause) { super(key); this.key = key; this.cause = cause; } }
const log = (where, e) => { if (e) console.warn(`[${where}]`, e.code || '', e.status || '', e.message || e); };

function authErrorKey(e, mode) {
  const code = (e && e.code) || '', status = e && e.status;
  if (status === 429 || /rate_limit/.test(code)) return 'auth.rate';
  if (code === 'weak_password') return 'auth.weak';
  return mode === 'up' ? 'auth.failUp' : 'auth.failIn';
}
function pwErrorKey(e) {
  const code = (e && e.code) || '', status = e && e.status;
  if (status === 429 || /rate_limit/.test(code)) return 'auth.rate';
  if (code === 'weak_password') return 'auth.weak';
  if (code === 'same_password') return 'auth.samePw';
  if (code === 'reauthentication_needed') return 'auth.reauth';
  if (status === 401 || status === 403 || code === 'session_not_found' || code === 'session_expired') return 'auth.linkExpired';
  return 'auth.pwFail';
}
function dbErrorKey(e) {
  const code = (e && e.code) || '';
  if (code === '23514') return 'error.tooBig';                       // CHECK: data > 3 МБ
  if (code === 'PGRST301' || code === '42501' || (e && e.status === 401)) return 'error.session';
  return 'error.save';
}

export const auth = {
  async session() {
    const { data, error } = await sb.auth.getSession();
    if (error) { log('session', error); return null; }
    const u = data.session && data.session.user;
    return u ? { id: u.id, email: u.email || '' } : null;
  },
  async signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) { log('signUp', error); throw new AppError(authErrorKey(error, 'up'), error); }
    return data.session ? { id: data.user.id, email } : 'confirm';
  },
  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { log('signIn', error); throw new AppError(authErrorKey(error, 'in'), error); }
    return { id: data.user.id, email: data.user.email || email };
  },
  /* Письмо со ссылкой для нового пароля. Ответ всегда нейтральный: не раскрываем, есть ли такой адрес. */
  async resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) {
      log('reset', error);
      if (error.status === 429 || /rate_limit/.test(error.code || '')) throw new AppError('auth.rate', error);
      if (error.status >= 500 || !error.status) throw new AppError('auth.resetFail', error);
    }
  },
  /* Новый пароль: после перехода по ссылке из письма (сессия восстановления) или из меню «Сменить пароль». */
  async setPassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) { log('setPassword', error); throw new AppError(pwErrorKey(error), error); }
  },
  async signOut() {
    try { await sb.auth.signOut(); } catch (e) { log('signOut', e); }
    ['dd-voice', 'dd-users', 'dd-session'].forEach(k => ls.del(k));
  },
  onChange(cb) {
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      const u = session && session.user;
      cb(event, u ? { id: u.id, email: u.email || '' } : null);
    });
    return () => data.subscription.unsubscribe();
  },
};

/* Убираем то, что не должно попасть в базу: временные blob-ссылки, служебные флаги. */
function toStored(d) {
  const { song = {}, ...rest } = d;
  const { fileUrl, badLink, ...songRest } = song;
  return JSON.parse(JSON.stringify({ ...rest, song: songRest }));
}

export const store = {
  async load(uid) {
    const { data, error } = await sb.from('days').select('id,data').eq('user_id', uid).order('created_at');
    if (error) { log('load', error); throw new AppError(dbErrorKey(error) === 'error.session' ? 'error.session' : 'error.load', error); }
    const metaRow = data.find(r => r.id === META_ID);
    const days = data.filter(r => !String(r.id).startsWith('meta:')).map(r => sanitizeDay(r.data)).filter(Boolean);
    const m = metaRow && metaRow.data;
    return { days, cats: m ? sanitizeCats(m.cats) : null, layout: sanitizeLayout(m && m.layout), v: m && Number.isInteger(m.v) ? m.v : 1 };
  },
  async saveDay(uid, d) {
    const row = toStored(d);
    const { error } = await sb.from('days').upsert({ id: row.id, user_id: uid, data: row });
    if (error) { log('saveDay', error); throw new AppError(dbErrorKey(error), error); }
  },
  async saveMeta(uid, cats, layout) {
    const data = { id: META_ID, cats, layout, v: META_V };
    const { error } = await sb.from('days').upsert({ id: META_ID, user_id: uid, data });
    if (error) { log('saveMeta', error); throw new AppError(dbErrorKey(error), error); }
  },
  async remove(uid, id) {
    const { error } = await sb.from('days').delete().eq('user_id', uid).eq('id', id);
    if (error) { log('remove', error); throw new AppError(dbErrorKey(error), error); }
  },
};
