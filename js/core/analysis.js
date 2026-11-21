/* =====================================================================
   Ядро: текст + фото + песня → настроение → художественный приём, палитра, ритм, голос.
   Логика и числа перенесены из исходного index.html без изменений (старые записи выглядят так же).
   Изменения: названия времени суток/сезона/настроения теперь ключи (для перевода),
   объяснение «почему» строится при показе на выбранном языке (explain), а не хранится текстом.
   ===================================================================== */
import { clamp, textLang } from '../lib/util.js';

/* словари основ слов (пока только русский) */
const LEX = {
  calm: ['спокой', 'тепл', 'уют', 'какао', 'чай', 'тих', 'медленн', 'гуля', 'закат', 'камин', 'книг', 'пруд'],
  energy: ['бег', 'танц', 'быстр', 'вечеринк', 'друз', 'смех', 'концерт', 'ярк', 'драйв', 'крич', 'прыг'],
  tense: ['срочн', 'дедлайн', 'сдач', 'нерв', 'стресс', 'проект', 'экзамен', 'офис', 'успе', 'тревог'],
  sad: ['груст', 'одинок', 'дожд', 'скуч', 'тоск', 'плак', 'потер', 'туман', 'пусто'],
  joy: ['счаст', 'радост', 'солнц', 'море', 'улыб', 'любл', 'любим', 'влюб', 'смеял', 'отпуск'],
};
const SEAS = [['autumn', ['Осенний', 'Осеннее'], /осен|лист|октябр|ноябр/], ['winter', ['Зимний', 'Зимнее'], /зим|снег|мороз|декабр/],
  ['spring', ['Весенний', 'Весеннее'], /весн|подснеж|апрел|капел/], ['summer', ['Летний', 'Летнее'], /лето|летн|жар|пляж|море|июл/]];
const TIMES = [['night', 'Ночь', /ноч|полночь/], ['morning', 'Утро', /утр|рассвет|завтрак/], ['day', 'День', /днём|днем|полдень|обед/], ['evening', 'Вечер', /вечер|закат|сумерк/]];
export const PLACES = [[/парк/, 'park', 'парк', 'в парке', 0], [/мор[еяю]|пляж/, 'sea', 'море', 'у моря', 1], [/офис/, 'office', 'офис', 'в офисе', 0],
  [/пруд|озер/, 'pond', 'пруд', 'у пруда', 0], [/кафе|кофейн/, 'cafe', 'кафе', 'в кафе', 1], [/лес/, 'forest', 'лес', 'в лесу', 0],
  [/город|улиц/, 'city', 'город', 'в городе', 0], [/дом|квартир/, 'home', 'дом', 'дома', 0]];
const DET = [[/какао/, 'и какао'], [/сдач|дедлайн/, 'перед сдачей'], [/друз/, 'с друзьями'], [/девушк|любим|жен[аы]/, 'вдвоём'], [/дожд/, 'под дождём']];
const PAD = { calm: 'без спешки', tense: 'на пределе', sad: 'в тишине', joy: 'в лучах света', energy: 'на всех скоростях' };
const MOODH = { calm: 28, joy: 45, energy: 8, tense: 215, sad: 228 };

export const MOODS = ['calm', 'energy', 'tense', 'sad', 'joy'];
export const TECHS = ['monet', 'kandinsky', 'minimal', 'collage', 'film'];
/* Жанры (выбор жанра убран на этапе 5, A1): у старых записей поле song.genre сохраняется, но на расчёт не влияет. */
export const DEFAULT_SONG = { bpm: 118, mode: 'major', energy: .6 };

/* ---------- Карта настроения (этап 5) ----------
   valence: −1 грустно … +1 радостно; energy: −1 спокойно … +1 энергично. */
export const isMood = m => !!m && isFinite(m.valence) && isFinite(m.energy);
export function moodSector(v, e) {
  if (Math.hypot(v, e) < .25) return 'center';
  const a = (Math.atan2(e, v) * 180 / Math.PI + 360) % 360;                  // 0° = вправо (радость), 90° = вверх (энергия)
  return ['joy', 'delight', 'alert', 'anxiety', 'sad', 'gloom', 'calm', 'calmJoy'][Math.round(a / 45) % 8];
}
const SECTOR_DOM = { center: 'calm', joy: 'joy', delight: 'joy', alert: 'energy', anxiety: 'tense', sad: 'sad', gloom: 'sad', calm: 'calm', calmJoy: 'calm' };

/* A1: темп, лад и энергия песни больше не вводятся вручную — они выводятся из настроения.
   Высокая энергия → быстрый темп, позитив → мажор. Числа подобраны так, чтобы tN = энергия (см. analyze). */
export function moodToMusicParams(v, e) {
  const e01 = clamp((e + 1) / 2);
  return { bpm: Math.round(60 + 100 * e01), mode: v >= 0 ? 'major' : 'minor', energy: Math.round(clamp(.1 + .8 * e01) * 100) / 100 };
}

export const placeOf = text => { const low = String(text || '').toLowerCase(); const p = PLACES.find(x => x[0].test(low)); return p ? p[1] : null; };

/* Все промежуточные величины. Детерминировано: одинаковый вход → одинаковый результат. */
export function analyze({ text, photos, song, mood }) {
  const low = String(text || '').toLowerCase();
  const sg = { ...DEFAULT_SONG, ...(song || {}) };
  const cnt = k => clamp(LEX[k].reduce((n, w) => n + low.split(w).length - 1, 0) / 2);
  const sc = {}; Object.keys(LEX).forEach(k => { sc[k] = cnt(k); });
  const list = photos && photos.length ? photos : [{ h: 30, s: .3, l: .5, warm: 0 }];
  const ph = list.reduce((a, p) => ({ s: a.s + p.s / list.length, l: a.l + p.l / list.length, w: a.w + p.warm / list.length,
    x: a.x + Math.cos(p.h * Math.PI / 180), y: a.y + Math.sin(p.h * Math.PI / 180) }), { s: 0, l: 0, w: 0, x: 0, y: 0 });
  const pH = (Math.atan2(ph.y, ph.x) * 180 / Math.PI + 360) % 360, tN = clamp((sg.bpm - 60) / 100), maj = sg.mode === 'major';
  let aro = clamp(.35 + .3 * sc.energy + .2 * sc.tense - .25 * sc.calm + .35 * (sg.energy - .5) + .3 * (tN - .4));
  let val = clamp(.5 + .3 * sc.joy + .15 * sc.calm - .3 * sc.sad - .15 * sc.tense + (maj ? .12 : -.12) + .1 * ph.w + .1 * (ph.l - .5));
  const md = isMood(mood) ? mood : null;
  if (md) {                                          // точка на карте настроения весит половину
    aro = clamp(.5 * aro + .5 * (md.energy + 1) / 2);
    val = clamp(.5 * val + .5 * (md.valence + 1) / 2);
  }
  const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  const dom = top[1] > 0 ? top[0] : md ? SECTOR_DOM[moodSector(md.valence, md.energy)] : (aro > .55 ? 'energy' : 'calm');
  const tech = sc.tense > .4 && aro > .45 ? 'kandinsky' : val < .4 && aro < .5 ? 'minimal' : aro > .62 && val > .5 ? 'collage' : aro < .55 && val >= .45 ? 'monet' : 'film';
  const season = SEAS.find(s => s[2].test(low)), timeE = TIMES.find(t => t[2].test(low)) || TIMES[2], place = PLACES.find(p => p[0].test(low)), det = (DET.find(d => d[0].test(low)) || [])[1];
  const wp = ph.s > .08 ? .55 : .15;
  const sec = clamp(7.5 - 4.5 * aro, 3, 7.5);
  const grain = tech === 'film' ? .45 : tech === 'minimal' ? .08 : .15 + .15 * aro;
  const voiceKey = aro < .4 && val > .45 ? 'warm' : aro > .6 ? 'fast' : val < .4 ? 'low' : 'even';
  return { low, sg, sc, ph, pH, maj, aro, val, dom, tech, season, timeE, place, det, wp, sec, grain, voiceKey, md };
}

/* Запасное автоназвание для записей не на русском (русские словари мест и сезонов их не узнают). */
const TIME_L = { kk: { night: 'Түн', morning: 'Таң', day: 'Күн', evening: 'Кеш' }, en: { night: 'Night', morning: 'Morning', day: 'Day', evening: 'Evening' } };
const PAD_L = {
  kk: { calm: 'асықпай', tense: 'шегіне жетіп', sad: 'тыныштықта', joy: 'шуаққа бөленіп', energy: 'барынша жылдам' },
  en: { calm: 'without hurry', tense: 'on the edge', sad: 'in silence', joy: 'in the sunlight', energy: 'at full speed' },
};

const hs = (a, b, c) => `hsl(${Math.round(((a % 360) + 360) % 360)} ${Math.round(b)}% ${Math.round(c)}%)`;

export function makeDay({ id, date, text, photos: ph0, song, mood, customTitle, newId }) {
  const photos = ph0.map(p => ({ h: 30, s: .3, l: .5, warm: 0, ...p }));
  const A = analyze({ text, photos, song, mood });
  const { sc, ph, pH, aro, val, dom, tech, season, timeE, place, det, wp, sec, grain } = A;
  const time = timeE[1];
  let w = season && place ? [season[1][place[4]], place[2], det] : [time, place && place[3], det];
  let words = w.filter(Boolean).join(' ').split(' ');
  if (words.length < 3) words = words.concat(PAD[dom].split(' '));
  let title = words.slice(0, 7).join(' ').replace(/^./, c => c.toUpperCase());
  const tl = textLang(text);
  if (tl !== 'ru' && !season && !place && !det) title = `${TIME_L[tl][timeE[0]]} ${PAD_L[tl][dom]}`;
  const mh = MOODH[dom];
  const h = (Math.atan2(wp * Math.sin(pH * Math.PI / 180) + (1 - wp) * Math.sin(mh * Math.PI / 180),
    wp * Math.cos(pH * Math.PI / 180) + (1 - wp) * Math.cos(mh * Math.PI / 180)) * 180 / Math.PI + 360) % 360;
  const dark = sc.tense > .4 || sc.sad > .4 || timeE[0] === 'night', S = 28 + 40 * aro + 15 * val, L = dark ? 11 : tech === 'minimal' ? 93 : 84;
  const style = {
    tech, s1: hs(h, S * .5, L), s2: hs(h + 30, S * .6, L + (dark ? 8 : -8)), sa: hs(h + (tech === 'kandinsky' ? 150 : 20), clamp(S + 15, 40, 90), dark ? 62 : 48),
    si: hs(h, 20, dark ? 92 : 15), grain, sec, kspeed: Math.round(40 - 25 * aro), aro, val, dark,
    voice: { rate: .82 + .3 * aro, pitch: .95 + .2 * val, key: A.voiceKey },
  };
  return {
    id: id || newId(), date, text,
    photos: photos.map(({ url, h: hh, s, l, warm }) => ({ url, h: hh, s, l, warm })),
    song, title: customTitle || title, manualTitle: !!customTitle, style,
    ...(A.md ? { mood: { valence: Math.round(A.md.valence * 100) / 100, energy: Math.round(A.md.energy * 100) / 100 } } : {}),
  };
}

/* Объяснение «Почему день выглядит так» на текущем языке (t — функция перевода). */
export function explain(d, t) {
  const A = analyze({ text: d.text, photos: d.photos, song: d.song, mood: d.mood });
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

/* Квадрант настроения (для блока «Настроение недели» и будущей карты настроения) */
export const quadrant = (aro, val) => (val >= .5 ? (aro < .5 ? 'calmJoy' : 'delight') : (aro >= .5 ? 'anxiety' : 'sad'));
