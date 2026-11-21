/* Демо-дни для пустой карты. Картинки — сгенерированные градиенты (SVG → JPEG через canvas). */
import { rng } from '../lib/util.js';
import { prepImage } from '../lib/files.js';
import { makeDay } from './analysis.js';

const demoSvg = (c, s) => {
  const r = rng(s); let o = '';
  for (let i = 0; i < 9; i++) o += `<circle cx="${r() * 400}" cy="${r() * 500}" r="${20 + r() * 90}" fill="${c[2]}" opacity="${.08 + r() * .25}"/>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/>${o}</svg>`);
};
const SEEDS = [
  ['2026-10-18', 'Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали.', { artist: 'Frank Sinatra', genre: 'джаз / классика', year: '1957', bpm: 78, mode: 'major', energy: .3 }, ['#e9b44c', '#8a4b22', '#fff3c4']],
  ['2026-11-02', 'Срочная сдача проекта, ночь в офисе, кофе, нервы и дедлайн. В наушниках электронная музыка, к утру всё собралось.', { artist: 'Rival Consoles', genre: 'электроника', year: '2018', bpm: 132, mode: 'minor', energy: .85 }, ['#1b2a41', '#0c1220', '#5f8fd1']],
  ['2026-11-09', 'Весь вечер шёл дождь, было грустно и тихо, я скучал по дому и смотрел в окно.', { artist: 'Nils Frahm', genre: 'ambient', year: '2012', bpm: 62, mode: 'minor', energy: .15 }, ['#4a5a68', '#20262e', '#9fb3c4']],
  ['2026-07-14', 'Летом с друзьями поехали к морю: ярко, смех, солнце, танцы до заката, счастье.', { artist: 'Dua Lipa', genre: 'поп', year: '2020', bpm: 124, mode: 'major', energy: .85 }, ['#ffb36b', '#1f9fb8', '#fff3a8']],
];
export async function seedDays(newId) {
  const out = [];
  for (const [i, s] of SEEDS.entries()) {
    const photos = [await prepImage(demoSvg(s[3], i * 7 + 1)), await prepImage(demoSvg(s[3], i * 7 + 5))];
    out.push(makeDay({ date: s[0], text: s[1], photos, song: { ...s[2], link: '' }, newId }));
  }
  return out;
}
