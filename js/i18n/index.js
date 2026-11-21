import ru from './ru.js';
import kk from './kk.js';
import en from './en.js';
import { createContext, useContext } from '../lib/react.js';
import { parseLocalDate } from '../lib/util.js';

export const LANGS = Object.freeze([
  { code: 'kk', label: 'Қазақша', short: 'ҚАЗ', locale: 'kk-KZ', speech: 'kk-KZ' },
  { code: 'ru', label: 'Русский', short: 'РУС', locale: 'ru-RU', speech: 'ru-RU' },
  { code: 'en', label: 'English', short: 'ENG', locale: 'en-US', speech: 'en-US' },
]);
const DICTS = { ru, kk, en };
export const isLang = c => Object.prototype.hasOwnProperty.call(DICTS, c);
export const localeOf = code => (LANGS.find(l => l.code === code) || LANGS[1]).locale;

/* Язык по умолчанию: сохранённый выбор → язык браузера → русский. */
export function detectLang(saved) {
  if (isLang(saved)) return saved;
  const list = (navigator.languages || [navigator.language || 'ru']).map(l => String(l).slice(0, 2).toLowerCase());
  return list.find(isLang) || 'ru';
}

/* t('key', {n: 2}) — подстановка параметров только как текст (интерфейс выводит строки через React, без HTML). */
export function makeT(lang) {
  const dict = DICTS[lang] || ru;
  const pr = new Intl.PluralRules(localeOf(lang));
  const t = (key, params) => {
    let s = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : ru[key];
    if (s == null) return key;
    if (typeof s === 'object') return s.other || '';
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m));
    return s;
  };
  t.plural = (key, n) => {
    const forms = (Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : ru[key]) || {};
    return forms[pr.select(n)] || forms.other || '';
  };
  t.lang = lang;
  t.locale = localeOf(lang);
  t.date = s => {
    const d = parseLocalDate(s);
    return d ? d.toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  };
  t.num = (n, opt) => new Intl.NumberFormat(t.locale, opt).format(n);
  return t;
}

/* Все переводы ключа — чтобы узнавать стандартные названия категорий, созданные на любом языке. */
export const allValues = key => Object.values(DICTS).map(d => d[key]).filter(v => typeof v === 'string');

export const I18n = createContext(makeT('ru'));
export const useT = () => useContext(I18n);
