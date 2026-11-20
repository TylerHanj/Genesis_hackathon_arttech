export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/* Детерминированный генератор случайных чисел (одинаковая раскладка карточек при каждом открытии). */
export const rng = s => () => {
  s |= 0; s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const hash = str => { let h = 7; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'd' + Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join(''));

/* Сегодняшняя дата в МЕСТНОМ часовом поясе (раньше бралась по UTC: в Казахстане до 05:00 получалось «вчера»). */
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/* 'YYYY-MM-DD' → дата в местном времени (new Date('YYYY-MM-DD') читается как UTC и сдвигает день). */
export function parseLocalDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}
export const isValidDate = s => !!parseLocalDate(s);

export const ls = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* квота или приватный режим */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
