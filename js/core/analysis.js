/* =====================================================================
   Ядро: текст + фото + песня + контекст → настроение → приём, палитра, ритм, голос, эффекты.
   Совместимость: для старых записей (без новых полей) все числа считаются как раньше.
   Новое (этап 6): казахский и английский в словарях, люди и события, сезон по дате,
   главные цвета и свет фото, анализ звука и эпоха песни, погода (по согласию) и время съёмки.
   ===================================================================== */
import { clamp, textLang } from '../lib/util.js';
import { characteristic } from './vision.js';

const K = 'а-яёәғқңөұүһі';                    // буквы для границ слов в кириллице
const W = s => new RegExp(`(^|[^${K}a-z])(?:${s})`);   // «с начала слова»

/* Основы слов по настроениям. Русские — как раньше; казахские и английские дописаны отдельно
   (без пересечений с русскими, чтобы старые записи считались так же). */
const LEX = {
  calm: ['спокой', 'тепл', 'уют', 'какао', 'чай', 'тих', 'медленн', 'гуля', 'закат', 'камин', 'книг', 'пруд',
    'тыныш', 'жайлы', 'баяу', 'кітап', 'серуен', 'жайбарақат', 'calm', 'quiet', 'cozy', 'cosy', 'slow', 'tea', 'book', 'peace', 'relax'],
  energy: ['бег', 'танц', 'быстр', 'вечеринк', 'друз', 'смех', 'концерт', 'ярк', 'драйв', 'крич', 'прыг',
    'биледі', 'билеп', 'жүгір', 'жылдам', 'достар', 'күлкі', 'шулы', 'секір', 'danc', 'party', 'friends', 'laugh', 'concert', 'loud', 'jump', 'fast'],
  tense: ['срочн', 'дедлайн', 'сдач', 'нерв', 'стресс', 'проект', 'экзамен', 'офис', 'успе', 'тревог',
    'асығ', 'емтихан', 'мазасыз', 'жүйке', 'шаршад', 'deadline', 'exam', 'stress', 'urgent', 'nervous', 'anxious', 'pressure', 'overtime'],
  sad: ['груст', 'одинок', 'дожд', 'скуч', 'тоск', 'плак', 'потер', 'туман', 'пусто',
    'мұң', 'жалғыз', 'жаңбыр', 'сағын', 'жылад', 'тұман', 'қайғы', 'sad', 'lonely', 'rain', 'miss ', 'cry', 'fog', 'empty', 'grief'],
  joy: ['счаст', 'радост', 'солнц', 'море', 'улыб', 'любл', 'любим', 'влюб', 'смеял', 'отпуск',
    'қуан', 'бақыт', 'шуақ', 'теңіз', 'күлді', 'күлім', 'сүйікті', 'демалыс', 'happy', 'happi', 'joy', 'sunny', 'smil', 'love', 'vacation', 'holiday'],
};
const or = (ru, extra) => new RegExp(`${ru.source}|${extra.source}`);
const SEAS = [
  ['autumn', ['Осенний', 'Осеннее'], or(/осен|лист|октябр|ноябр/, W('күз(?:гі|де)?(?![' + K + '])|қараша|autumn'))],
  ['winter', ['Зимний', 'Зимнее'], or(/зим|снег|мороз|декабр/, W('қыс(?:та|қы|ы)?(?![' + K + '])|қар(?:лы)?(?![' + K + '])|аяз|желтоқсан|winter|snow|frost'))],
  ['spring', ['Весенний', 'Весеннее'], or(/весн|подснеж|апрел|капел/, W('көктем|сәуір|spring'))],
  ['summer', ['Летний', 'Летнее'], or(/лето|летн|жар|пляж|море|июл/, W('жазғы|жазда(?![' + K + '])|шілде|summer|beach'))]];
const TIMES = [
  ['night', 'Ночь', or(/ноч|полночь/, W('түн(?:де|гі)?(?![' + K + '])|night|midnight'))],
  ['morning', 'Утро', or(/утр|рассвет|завтрак/, W('таң(?:ер|ғы)|morning|sunrise|breakfast'))],
  ['day', 'День', or(/днём|днем|полдень|обед/, W('күндіз|түсте|түскі|afternoon|noon|lunch'))],
  ['evening', 'Вечер', or(/вечер|закат|сумерк/, W('кеш(?:ке|кі|те|құрым)(?![' + K + '])|күн бат|evening|sunset|dusk'))]];
/* [регулярка, ключ, рус. имя, рус. «где», род, каз. имя, каз. «-дағы», англ. «где»] */
export const PLACES = [
  [or(/парк/, W('саябақ|park')), 'park', 'парк', 'в парке', 0, 'саябақ', 'Саябақтағы', 'in the park'],
  [or(/мор[еяю]|пляж/, W('теңіз|жағажай|sea(?![a-z])|beach')), 'sea', 'море', 'у моря', 1, 'теңіз', 'Теңіздегі', 'by the sea'],
  [or(/офис/, W('кеңсе|office')), 'office', 'офис', 'в офисе', 0, 'кеңсе', 'Кеңседегі', 'at the office'],
  [or(/пруд|озер/, W('тоған|көлде|көлге|lake|pond')), 'pond', 'пруд', 'у пруда', 0, 'тоған', 'Тоғандағы', 'by the pond'],
  [or(/кафе|кофейн/, W('кофехана|café|cafe|coffee shop')), 'cafe', 'кафе', 'в кафе', 1, 'кафе', 'Кафедегі', 'at the café'],
  [or(/лес/, W('орман|forest|woods')), 'forest', 'лес', 'в лесу', 0, 'орман', 'Ормандағы', 'in the forest'],
  [or(/город|улиц/, W('қала(?:да|ға|дағы|ны|мыз)?(?![' + K + '])|көше|city|street|downtown')), 'city', 'город', 'в городе', 0, 'қала', 'Қаладағы', 'in the city'],
  [or(/дом|квартир/, W('үй(?:де|ге|ден|ім|імде)?(?![' + K + '])|пәтер|home|apartment')), 'home', 'дом', 'дома', 0, 'үй', 'Үйдегі', 'at home']];
const DET = [[/какао/, 'и какао'], [/сдач|дедлайн/, 'перед сдачей'], [/друз/, 'с друзьями'], [/девушк|любим|жен[аы]/, 'вдвоём'], [/дожд/, 'под дождём']];

/* Люди и события — для панели «Как собран этот день» (на стиль не влияют, чтобы не менять старые записи). */
export const PEOPLE = [
  ['friends', W('друз|друг(?:ом|ой|у)|подруг|дос(?:тар|ым|пен)|friend')],
  ['family', W('мам|пап(?:а|ой|е|у|ы)(?![' + K + '])|семь|родител|бабуш|дедуш|сестр|брат|ана(?:м|мен|ммен)(?![' + K + '])|әке|отбас|әже|mom|mum|dad|family|parents|sister|brother|grand')],
  ['partner', or(/девушк|любим|жен[аы]/, W('парн(?:ем|я)|муж(?:ем|а)?(?![' + K + '])|жар(?:ым|ыммен)|boyfriend|girlfriend|wife|husband|partner'))],
  ['colleagues', W('коллег|начальн|әріптес|colleague|coworker|team(?![a-z])')],
  ['kids', W('дет(?:и|ьми|ей)(?![' + K + '])|ребён|ребен|доч|бала(?:лар|мен|ларым)|kids|child|daughter')],
  ['alone', W('один(?![' + K + '])|одна(?![' + K + '])|в одиночестве|жалғыз|alone|by myself')]];
export const EVENTS = [
  ['celebration', W('праздник|день рождени|юбиле|свадьб|мереке|туған күн|birthday|wedding|celebrat')],
  ['trip', W('поездк|дорог|путешеств|самол[её]т|поезд|сапар|ұшақ|пойыз|trip|travel|flight|train')],
  ['food', W('ужин|обед|завтрак|какао|кофе|чай|готовил|пирог|ресторан|тамақ|кешкі ас|таңғы ас|dinner|lunch|breakfast|coffee|cocoa|cook')],
  ['sport', W('трениров|спорт|футбол|жаттығу|workout|gym|running|football')],
  ['study', W('уч[её]б|экзамен|лекци|урок|универ|сабақ|емтихан|study|exam|lecture')],
  ['work', W('работ|офис|проект|дедлайн|жұмыс|кеңсе|work|office|project|deadline')],
  ['concert', W('концерт|concert|gig')],
  ['movie', W('кино|фильм|movie|cinema|film')],
  ['walk', W('гуля|прогулк|серуен|walk')]];
/* Погода, упомянутая в тексте (используется, если погода не получена по согласию) */
const TEXT_WEATHER = [['rain', W('дожд|ливн|морос|жаңбыр|rain')], ['snow', W('снег|снеж|қар жау|снегопад|snow')],
  ['fog', W('туман|тұман|fog|mist')], ['clear', W('солнечн|солнце|шуақ|sunny|sunshine')]];

const PAD = { calm: 'без спешки', tense: 'на пределе', sad: 'в тишине', joy: 'в лучах света', energy: 'на всех скоростях' };
const MOODH = { calm: 28, joy: 45, energy: 8, tense: 215, sad: 228 };

export const MOODS = ['calm', 'energy', 'tense', 'sad', 'joy'];
export const TECHS = ['monet', 'kandinsky', 'minimal', 'collage', 'film'];
export const WEATHER_KINDS = ['clear', 'clouds', 'fog', 'rain', 'snow', 'storm'];
export const ERAS = ['pre60', 'e60', 'e80', 'e90', 'e00'];
export const DEFAULT_SONG = { bpm: 118, mode: 'major', energy: .6 };

/* ---------- Карта настроения ---------- */
export const isMood = m => !!m && isFinite(m.valence) && isFinite(m.energy);
export const SECTORS = ['joy', 'delight', 'alert', 'anxiety', 'gloom', 'sad', 'calm', 'calmJoy'];
/* Один из 8 секторов по углу (без «центра»): 0° = вправо (радость), 90° = вверх (энергия), шаг 45°. */
export function sectorOf(v, e) {
  const a = (Math.atan2(e, v) * 180 / Math.PI + 360) % 360;
  return ['joy', 'delight', 'alert', 'anxiety', 'gloom', 'sad', 'calm', 'calmJoy'][Math.round(a / 45) % 8];
}
export function moodSector(v, e) {
  if (Math.hypot(v, e) < .25) return 'center';
  return sectorOf(v, e);
}
const SECTOR_DOM = { center: 'calm', joy: 'joy', delight: 'joy', alert: 'energy', anxiety: 'tense', sad: 'sad', gloom: 'sad', calm: 'calm', calmJoy: 'calm' };

/* Темп, лад и энергия из настроения — запасной вариант, если у песни нет своего анализа. */
export function moodToMusicParams(v, e) {
  const e01 = clamp((e + 1) / 2);
  return { bpm: Math.round(60 + 100 * e01), mode: v >= 0 ? 'major' : 'minor', energy: Math.round(clamp(.1 + .8 * e01) * 100) / 100 };
}

/* Жанр (из описания песни) → типичные темп и энергия */
const GENRE_PROFILE = [
  [/jazz|джаз|blues|swing/i, 92, .35], [/classic|классик|opera|орган/i, 80, .25], [/ambient|new age|chill|lo-?fi/i, 72, .2],
  [/hip.?hop|rap|рэп/i, 92, .7], [/electr|dance|house|techno|edm|trance/i, 126, .85], [/metal|punk|hard rock/i, 150, .95],
  [/rock|alternative|indie|рок/i, 122, .75], [/folk|singer|acoustic|country|фолк/i, 98, .4], [/r&b|soul|funk/i, 100, .6],
  [/pop|k-pop|поп/i, 116, .7], [/soundtrack|score|саундтрек/i, 90, .45]];
export function genreProfile(genre) { const g = GENRE_PROFILE.find(x => x[0].test(String(genre || ''))); return g ? { bpm: g[1], energy: g[2] } : null; }

export function eraOf(year) {
  const y = parseInt(String(year || ''), 10);
  if (!(y > 1890 && y < 2100)) return null;
  return y < 1960 ? 'pre60' : y < 1980 ? 'e60' : y < 1990 ? 'e80' : y < 2000 ? 'e90' : y < 2010 ? 'e00' : null;
}
const seasonOfDate = date => { const m = /^\d{4}-(\d{2})/.exec(String(date || '')); if (!m) return null; const k = +m[1]; return k <= 2 || k === 12 ? 'winter' : k <= 5 ? 'spring' : k <= 8 ? 'summer' : 'autumn'; };
const timeOfHour = h => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 22 ? 'evening' : 'night');

export const placeOf = text => { const low = String(text || '').toLowerCase(); const p = PLACES.find(x => x[0].test(low)); return p ? p[1] : null; };

/* Все промежуточные величины. Детерминировано: одинаковый вход → одинаковый результат. */
export function analyze({ text, photos, song, mood, date, ctx }) {
  const low = String(text || '').toLowerCase();
  const sg = { ...DEFAULT_SONG, ...(song || {}) };
  const cnt = k => clamp(LEX[k].reduce((n, w) => n + low.split(w).length - 1, 0) / 2);
  const sc = {}; Object.keys(LEX).forEach(k => { sc[k] = cnt(k); });
  const list = photos && photos.length ? photos : [{ h: 30, s: .3, l: .5, warm: 0 }];
  const ph = list.reduce((a, p) => ({ s: a.s + p.s / list.length, l: a.l + (p.lum != null ? p.lum : p.l) / list.length, w: a.w + p.warm / list.length,
    x: a.x + Math.cos(p.h * Math.PI / 180), y: a.y + Math.sin(p.h * Math.PI / 180) }), { s: 0, l: 0, w: 0, x: 0, y: 0 });
  const ch = characteristic(list);                                         // главный цвет (у новых фото)
  const pH = ch ? ch.h : (Math.atan2(ph.y, ph.x) * 180 / Math.PI + 360) % 360, tN = clamp((sg.bpm - 60) / 100), maj = sg.mode === 'major';
  const nPh = photos ? photos.length : 0, newPhotos = list.some(p => p.dom);
  let aro = clamp(.35 + .3 * sc.energy + .2 * sc.tense - .25 * sc.calm + .35 * (sg.energy - .5) + .3 * (tN - .4) + (newPhotos ? .03 * (Math.min(nPh, 4) - 1) : 0));
  let val = clamp(.5 + .3 * sc.joy + .15 * sc.calm - .3 * sc.sad - .15 * sc.tense + (maj ? .12 : -.12) + .1 * ph.w + .1 * (ph.l - .5));
  const md = isMood(mood) ? mood : null;
  if (md) {                                          // точка на карте настроения весит половину
    aro = clamp(.5 * aro + .5 * (md.energy + 1) / 2);
    val = clamp(.5 * val + .5 * (md.valence + 1) / 2);
  }
  /* погода: по согласию (ctx.weather) или из текста */
  const wCtx = ctx && ctx.weather && WEATHER_KINDS.includes(ctx.weather.kind) ? ctx.weather : null;
  const tw = TEXT_WEATHER.find(x => x[1].test(low));
  const weather = wCtx ? { kind: wCtx.kind, t: wCtx.t, src: 'ctx' } : tw ? { kind: tw[0], src: 'text' } : null;
  if (weather && weather.src === 'ctx') {
    if (weather.kind === 'clear') val = clamp(val + .04);
    if (weather.kind === 'rain' || weather.kind === 'storm') val = clamp(val - .04);
    if (weather.kind === 'storm') aro = clamp(aro + .05);
  }
  const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  const dom = top[1] > 0 ? top[0] : md ? SECTOR_DOM[moodSector(md.valence, md.energy)] : (aro > .55 ? 'energy' : 'calm');
  const tenseCue = Math.max(sc.tense, md && moodSector(md.valence, md.energy) === 'anxiety' ? .5 : 0);   // «тревога» на карте = как слова о напряжении
  const tech = tenseCue > .4 && aro > .45 ? 'kandinsky' : val < .4 && aro < .5 ? 'minimal' : aro > .62 && val > .5 ? 'collage' : aro < .55 && val >= .45 ? 'monet' : 'film';
  const seasonT = SEAS.find(s => s[2].test(low)), seasonD = seasonT ? null : seasonOfDate(date);
  const season = seasonT || (seasonD ? SEAS.find(s => s[0] === seasonD) : null);
  const timeT = TIMES.find(t => t[2].test(low));
  const timeE = timeT || (ctx && isFinite(ctx.hour) ? TIMES.find(t => t[0] === timeOfHour(ctx.hour)) : null) || TIMES[2];
  const place = PLACES.find(p => p[0].test(low)), det = (DET.find(d => d[0].test(low)) || [])[1];
  const people = PEOPLE.filter(p => p[1].test(low)).map(p => p[0]), events = EVENTS.filter(e => e[1].test(low)).map(e => e[0]);
  const wp = (ch ? ch.s : ph.s) > .08 ? .55 : .15;
  const sec = clamp(7.5 - 4.5 * aro, 3, 7.5);
  const grain = tech === 'film' ? .45 : tech === 'minimal' ? .08 : .15 + .15 * aro;
  const voiceKey = aro < .4 && val > .45 ? 'warm' : aro > .6 ? 'fast' : val < .4 ? 'low' : 'even';
  const tags = [...new Set(list.flatMap(p => p.tags || []))];
  return { low, sg, sc, ph, pH, ch, maj, aro, val, dom, tech, season, seasonSrc: seasonT ? 'text' : seasonD ? 'date' : null, timeE,
    timeSrc: timeT ? 'text' : (ctx && isFinite(ctx.hour)) ? 'photo' : null, place, det, people, events, weather, tags, wp, sec, grain, voiceKey, md };
}

/* Запасное автоназвание для записей не на русском. */
const TIME_L = { kk: { night: 'Түн', morning: 'Таң', day: 'Күн', evening: 'Кеш' }, en: { night: 'Night', morning: 'Morning', day: 'Day', evening: 'Evening' } };
const TIME_KK_NOUN = { night: 'түн', morning: 'таң', day: 'күн', evening: 'кеш' };
const SEASON_ADJ = { kk: { autumn: 'Күзгі', winter: 'Қысқы', spring: 'Көктемгі', summer: 'Жазғы' }, en: { autumn: 'Autumn', winter: 'Winter', spring: 'Spring', summer: 'Summer' } };
const PAD_L = {
  kk: { calm: 'асықпай', tense: 'шегіне жетіп', sad: 'тыныштықта', joy: 'шуаққа бөленіп', energy: 'барынша жылдам' },
  en: { calm: 'without hurry', tense: 'on the edge', sad: 'in silence', joy: 'in the sunlight', energy: 'at full speed' },
};
function titleFor(A, text) {
  const { season, timeE, place, det, dom, seasonSrc } = A;
  const tl = textLang(text);
  if (tl === 'kk' || tl === 'en') {
    if (place && season && seasonSrc === 'text') return tl === 'kk' ? `${SEASON_ADJ.kk[season[0]]} ${place[5]}` : `${SEASON_ADJ.en[season[0]]} ${place[1] === 'home' ? 'at home' : place[1] === 'cafe' ? 'café' : place[1]}`;
    if (place) return tl === 'kk' ? `${place[6]} ${TIME_KK_NOUN[timeE[0]]}` : `${TIME_L.en[timeE[0]]} ${place[7]}`;
    return `${TIME_L[tl][timeE[0]]} ${PAD_L[tl][dom]}`;
  }
  const sz = seasonSrc === 'text' || place ? season : null;                 // сезон по дате — только вместе с местом
  const w = sz && place ? [sz[1][place[4]], place[2], det] : [timeE[1], place && place[3], det];
  let words = w.filter(Boolean).join(' ').split(' ');
  if (words.length < 3) words = words.concat(PAD[dom].split(' '));
  return words.slice(0, 7).join(' ').replace(/^./, c => c.toUpperCase());
}

const hs = (a, b, c) => `hsl(${Math.round(((a % 360) + 360) % 360)} ${Math.round(b)}% ${Math.round(c)}%)`;
const towards = (h, target, k) => { const d = ((target - h + 540) % 360) - 180; return h + d * k; };

export function makeDay({ id, date, text, photos: ph0, song, mood, ctx, customTitle, newId }) {
  const photos = ph0.map(p => ({ h: 30, s: .3, l: .5, warm: 0, ...p }));
  const A = analyze({ text, photos, song, mood, date, ctx });
  const { sc, pH, aro, val, dom, tech, timeE, wp, sec, grain, weather, tags } = A;
  const title = titleFor(A, text);
  const mh = MOODH[dom];
  let h = (Math.atan2(wp * Math.sin(pH * Math.PI / 180) + (1 - wp) * Math.sin(mh * Math.PI / 180),
    wp * Math.cos(pH * Math.PI / 180) + (1 - wp) * Math.cos(mh * Math.PI / 180)) * 180 / Math.PI + 360) % 360;
  let S = 28 + 40 * aro + 15 * val, Lplus = 0, g = grain;
  if (weather && weather.src === 'ctx') {                                    // погода по согласию мягко сдвигает палитру
    if (weather.kind === 'rain' || weather.kind === 'storm') h = towards(h, 212, .18);
    if (weather.kind === 'snow') { h = towards(h, 205, .12); Lplus = 4; }
    if (weather.kind === 'clouds') S *= .9;
    if (weather.kind === 'fog') { S *= .85; g = Math.min(.6, g + .05); }
    if (isFinite(weather.t)) { if (weather.t < 0) h = towards(h, 205, .1); else if (weather.t > 25) h = towards(h, 35, .1); }
  }
  const dark = sc.tense > .4 || sc.sad > .4 || timeE[0] === 'night' || tags.includes('night');
  const L = (dark ? 11 : tech === 'minimal' ? 93 : 84) + (dark ? 0 : Lplus);
  const era = eraOf(song && song.year);
  const style = {
    tech, s1: hs(h, S * .5, L), s2: hs(h + 30, S * .6, L + (dark ? 8 : -8)), sa: hs(h + (tech === 'kandinsky' ? 150 : 20), clamp(S + 15, 40, 90), dark ? 62 : 48),
    si: hs(h, 20, dark ? 92 : 15), grain: g, sec, kspeed: Math.round(40 - 25 * aro), aro, val, dark,
    voice: { rate: .82 + .3 * aro, pitch: .95 + .2 * val, key: A.voiceKey },
    ...(weather || era ? { fx: { ...(weather ? { weather: weather.kind } : {}), ...(era ? { era } : {}) } } : {}),
  };
  return {
    id: id || newId(), date, text,
    photos: photos.map(({ url, h: hh, s, l, warm, dom: dm, lum, con, tags: tg }) => ({ url, h: hh, s, l, warm, ...(dm ? { dom: dm, lum, con, tags: tg } : {}) })),
    song, title: customTitle || title, manualTitle: !!customTitle, style,
    ...(A.md ? { mood: { valence: Math.round(A.md.valence * 100) / 100, energy: Math.round(A.md.energy * 100) / 100 } } : {}),
    ...(ctx && (ctx.place || ctx.weather || isFinite(ctx.hour)) ? { ctx } : {}),
  };
}

/* Подробное объяснение (список) на текущем языке. Краткая панель — ui/Ingredients.js. */
export function explain(d, t) {
  const A = analyze({ text: d.text, photos: d.photos, song: d.song, mood: d.mood, date: d.date, ctx: d.ctx });
  const st = d.style, tech = st.tech;
  const found = MOODS.filter(k => A.sc[k] > 0).map(k => t('mood.' + k)).join(', ');
  const sec = (+st.sec || A.sec), grain = (st.grain != null ? st.grain : A.grain);
  const rate = st.voice ? st.voice.rate : .82 + .3 * A.aro, pitch = st.voice ? st.voice.pitch : .95 + .2 * A.val;
  const fmt = (n, f) => t.num(n, { minimumFractionDigits: f, maximumFractionDigits: f });
  const moodLine = A.md ? [t('why.mood', { name: t('sector.' + moodSector(A.md.valence, A.md.energy)), v: Math.round((A.md.valence + 1) * 50), e: Math.round((A.md.energy + 1) * 50) })] : [];
  return [
    ...moodLine,
    t('why.text', { found: found || t('why.neutral'), time: t('time.' + A.timeE[0]), season: A.season ? t('why.season', { s: t('season.' + A.season[0]) }) : '' }),
    t('why.photo', { h: Math.round(A.pH), l: Math.round(A.ph.l * 100), warmth: A.ph.w > 0 ? t('why.warm') : t('why.cold'), w: Math.round(A.wp * 100) }),
    t('why.song', { bpm: A.sg.bpm, mode: A.maj ? t('form.major') : t('form.minor'), e: Math.round(A.sg.energy * 100), sec: fmt(sec, 1), g: Math.round(grain * 100) }),
    t('why.tech', { name: t(`tech.${tech}.name`), why: t(`tech.${tech}.why`) }),
    t('why.result', { a: Math.round(st.aro * 100), v: Math.round(st.val * 100) }),
    t('why.voice', { desc: t('voice.' + voiceKeyOf(st)), rate: fmt(rate, 2), pitch: fmt(pitch, 2) }),
  ];
}
export const voiceKeyOf = st => (st.voice && st.voice.key) || (st.aro < .4 && st.val > .45 ? 'warm' : st.aro > .6 ? 'fast' : st.val < .4 ? 'low' : 'even');

/* Квадрант настроения (для блока «Настроение недели» и групп в категории) */
export const quadrant = (aro, val) => (val >= .5 ? (aro < .5 ? 'calmJoy' : 'delight') : (aro >= .5 ? 'anxiety' : 'sad'));
