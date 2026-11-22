/* =====================================================================
   Куда попадает воспоминание на карте. Без ИИ — словари, простая статистика слов и карта настроения;
   всё считается в браузере, наружу ничего не уходит.
   1) Карточку положили сами (перетаскиванием или «Перенести») — она там и остаётся.
   2) Свои круги пользователя:
      - по названию: если в названии понятная тема (работа, семья, друзья, море, осень, вечер, радость…),
        туда попадают дни с этой темой (словари текста, дата, время съёмки, настроение);
      - по примерам: если вы сами положили в круг 1–2+ воспоминания, похожие на них дни
        (общие редкие слова, общие темы, близкое настроение) попадают туда же.
      Круг с непонятным названием («asdasd») без примеров сам не заполняется — только вручную.
   3) Стандартные 8 кругов — по сектору карты настроения; если такой круг удалён — в ближайший по настроению.
   4) Иначе — без круга (в центре карты).
   ===================================================================== */
import { analyze, isMood, SECTORS } from './analysis.js';
import { SECTOR_CAT, daySector } from './layout.js';

export const STD_CATS = Object.values(SECTOR_CAT);
export const isStdCat = id => STD_CATS.includes(id);
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');

/* Темы в названии круга: проверяется начало каждого слова названия. */
const NAME_THEMES = [
  [['event:work'], 'работ|офис|проект|карьер|бизнес|жұмыс|кеңсе|work|office|job|career|business'],
  [['event:study'], 'уч[её]б|учеб|школ|универ|экзам|сесси|оқу|сабақ|мектеп|емтихан|study|school|uni|exam|class'],
  [['event:trip'], 'путешеств|поездк|поезд|отпуск|туризм|сапар|саяхат|trip|travel|journey|vacation'],
  [['event:food'], 'ед[аыу]$|кухн|ресторан|готов|рецепт|вкусн|тамақ|тағам|food|cook|kitchen|restaurant|recipe'],
  [['event:sport'], 'спорт|трениров|бег$|йог|фитнес|футбол|жаттығу|sport|gym|workout|run|yoga|fitness'],
  [['event:celebration'], 'праздн|рожд|свадьб|юбиле|мереке|birthday|party|holiday|celebrat|wedding'],
  [['event:concert'], 'концерт|фестив|музык|concert|festival|music|gig'],
  [['event:movie'], 'кино|фильм|сериал|movie|film|cinema'],
  [['event:walk'], 'прогул|гуля|серуен|walk'],
  [['people:friends'], 'друз|друг$|подруг|достар|досым|friend'],
  [['people:family'], 'семь|семейн|родн|родител|мам|пап|отбас|әке|туыс|family|mom|mum|dad|parents'],
  [['people:partner'], 'любов|любим|отношен|свидан|вдво[её]м|махаббат|love|dating|partner|couple'],
  [['people:kids'], 'дет[иск]|реб[её]н|бала|kids|children|child'],
  [['people:alone'], 'один|одна$|наедин|жалғыз|alone|myself'],
  [['people:colleagues'], 'коллег|команд|әріптес|colleague|team'],
  [['place:sea'], 'мор[еяю]|пляж|теңіз|sea$|beach|ocean'],
  [['place:park'], 'парк|саябақ|park'],
  [['place:forest'], 'лес|орман|forest|woods'],
  [['place:forest', 'place:park', 'place:pond', 'place:sea'], 'природ|табиғат|nature|outdoor'],
  [['place:city'], 'город|улиц|қала|көше|city|street'],
  [['place:home'], 'дом|квартир|үй$|үйде|home|house'],
  [['place:cafe'], 'кафе|кофейн|coffee|cafe|café'],
  [['season:autumn'], 'осен|күз|autumn|fall$'], [['season:winter'], 'зим|қыс|winter'],
  [['season:spring'], 'весн|көктем|spring'], [['season:summer'], 'лет[оа]$|летн|жаз|summer'],
  [['time:morning'], 'утр|таң|morning'], [['time:evening'], 'вечер|закат|кеш|evening|sunset'], [['time:night'], 'ноч|түн|night'],
  [['mood:joy'], 'радост|счаст|весел|позитив|қуаныш|бақыт|joy|happ|fun'],
  [['mood:sad'], 'груст|печал|тоск|сл[её]з|мұң|қайғы|sad|tears|blue$'],
  [['mood:calm'], 'спокой|тишин|уют|отдых|релакс|тыныш|демалыс|calm|cozy|cosy|relax|rest|chill'],
  [['mood:tense'], 'стресс|трев|нерв|напряж|дедлайн|мазасыз|stress|anx|tense|deadline'],
  [['mood:energy'], 'энерг|драйв|актив|тусов|вечерин|белсенд|energy|party|active|drive'],
  [['weather:rain'], 'дожд|жаңбыр|rain'], [['weather:snow'], 'снег|снеж|қар$|snow'],
].map(([keys, alts]) => [keys, new RegExp('^(?:' + alts + ')')]);

export function themesOfName(name) {
  const words = norm(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean), th = new Set();
  NAME_THEMES.forEach(([keys, re]) => { if (words.some(w => re.test(w))) keys.forEach(k => th.add(k)); });
  return th;
}

const SECTOR_MOODS = { joy: ['joy'], delight: ['joy', 'energy'], alert: ['energy'], anxiety: ['tense'], gloom: ['sad'], sad: ['sad'], calm: ['calm'], calmJoy: ['joy', 'calm'] };
const STOP = new Set(('и в во на с со к по за из у о об от до для без при про над под не ни но а же ли бы то это как что так все всё был была было были есть быть мы я ты он она они '
  + 'мне меня мой моя мои нас нам наш его её ее их там тут где когда потом сегодня вчера очень еще ещё уже только тоже просто день дня дней '
  + 'мен сен ол біз сіз олар және мен да де бір бүгін кеше өте әлі тек күн күні '
  + 'the and was were with for from that this have had are not but you all day today very just then').split(' '));
/* Слова пользователя: текст и название, если его задали вручную (автоназвание «День без спешки» — не слова пользователя). */
const ownText = d => `${d.manualTitle ? d.title || '' : ''} ${d.text || ''}`;
export const wordsOf = d => new Set(norm(ownText(d)).split(/[^\p{L}\p{N}]+/u)
  .filter(w => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)).map(w => w.slice(0, 5)));

const analyzeOwn = d => analyze({ text: ownText(d), photos: d.photos || [], song: d.song, mood: d.mood, date: d.date, ctx: d.ctx });
export function themesOfDay(d, A0) {
  const A = A0 || analyzeOwn(d);
  const th = new Set();
  A.events.forEach(k => th.add('event:' + k)); A.people.forEach(k => th.add('people:' + k));
  if (A.place) th.add('place:' + A.place[1]);
  if (A.season) th.add('season:' + A.season[0]);
  if (A.timeSrc) th.add('time:' + A.timeE[0]);
  if (A.weather) th.add('weather:' + A.weather.kind);
  const top = Object.entries(A.sc).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 0) th.add('mood:' + top[0]);
  (SECTOR_MOODS[daySector(d, A)] || []).forEach(k => th.add('mood:' + k));
  return th;
}
const pointOf = d => (isMood(d.mood) ? [d.mood.valence, d.mood.energy] : [((d.style && d.style.val) ?? .5) * 2 - 1, ((d.style && d.style.aro) ?? .5) * 2 - 1]);

/* Порог «похоже»: с двумя и более примерами — мягче, с одним — строже. */
const LIKE_T = { one: .45, many: .35 };
/* Тема из названия — уверенное совпадение. */
const NAME_SCORE = .9;

/* manual(d): карточку положили руками? (новая раскладка или старое поле day.cat) */
export function manualCat(d, layout) {
  const e = layout[d.id];
  if (e && !e.auto) return { cat: e.cat };
  if (!e && d.cat !== undefined) return { cat: d.cat };
  return null;
}

export function makeSorter(days, cats, layout) {
  const has = new Set(cats.map(c => c.id));
  const custom = cats.filter(c => !isStdCat(c.id));
  const cache = new Map();
  const feat = d => {
    let f = cache.get(d);
    if (!f) { const A = analyzeOwn(d); f = { words: wordsOf(d), themes: themesOfDay(d, A), pt: pointOf(d), sector: daySector(d, A) }; cache.set(d, f); }
    return f;
  };
  /* редкость (IDF) слов и тем по всем воспоминаниям: частое (сезон по дате, общее настроение, «работа» у всех)
     почти ничего не значит, редкое общее слово («гитара», «Саша») — значит много */
  const toks = f => { if (!f.toks) f.toks = new Set([...f.words, ...[...f.themes].map(k => '#' + k)]); return f.toks; };
  const df = new Map();
  if (custom.length) days.forEach(d => toks(feat(d)).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const N = Math.max(2, days.length);
  const idf = w => Math.log(N / Math.min(N, df.get(w) || 1));
  const wsum = s => { let n = 0; s.forEach(w => { n += idf(w); }); return n; };
  const sim = (a, b) => {
    const ta = toks(a), tb = toks(b);
    let inter = 0; ta.forEach(w => { if (tb.has(w)) inter += idf(w); });
    const ws = inter ? inter / Math.max(1e-9, Math.min(wsum(ta), wsum(tb))) : 0;
    if (ws < .18) return 0;                                               // одно настроение или сезон — ещё не сходство
    const ms = 1 - Math.hypot(a.pt[0] - b.pt[0], a.pt[1] - b.pt[1]) / 2.83;
    return .75 * ws + .25 * ms;
  };
  const examples = {}, nameTh = {};
  custom.forEach(c => {
    examples[c.id] = days.filter(d => { const m = manualCat(d, layout); return m && m.cat === c.id; });
    nameTh[c.id] = themesOfName(c.name);
  });
  const memo = new Map();
  const place = d => {
    const m = manualCat(d, layout);
    if (m) return { cat: m.cat, by: 'manual' };
    let best = null;
    for (const c of custom) {
      let s = 0, by = null, n = 0;
      const f = feat(d), nt = nameTh[c.id];
      for (const k of nt) if (f.themes.has(k)) { s = NAME_SCORE; by = 'name'; break; }
      const ex = examples[c.id];
      if (ex.length) {
        const sims = ex.map(e => sim(f, feat(e))).sort((a, b) => b - a);
        const ls = Math.min(.89, sims[0] + .1 * (sims[1] || 0));          // самый похожий пример + немного за второй
        if (ls >= (ex.length >= 2 ? LIKE_T.many : LIKE_T.one) && ls > s) { s = ls; by = 'like'; n = ex.length; }
      }
      if (by && (!best || s > best.s)) best = { cat: c.id, by, s, n };
    }
    if (best) return best;
    const sec = feat(d).sector, want = SECTOR_CAT[sec];
    if (has.has(want)) return { cat: want, by: 'mood', sector: sec };
    const i = SECTORS.indexOf(sec);
    for (let k = 1; k <= 4; k++) for (const j of [i + k, i - k]) {
      const id = SECTOR_CAT[SECTORS[(j + 8) % 8]];
      if (has.has(id)) return { cat: id, by: 'near', sector: sec };
    }
    return { cat: null, by: 'none' };
  };
  const fn = d => { let r = memo.get(d); if (!r) { r = place(d); memo.set(d, r); } return r; };
  fn.catOf = d => fn(d).cat;
  return fn;
}
