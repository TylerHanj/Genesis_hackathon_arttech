/* Озвучка через Web Speech API. Язык голоса определяется по тексту записи. */
import { useState, useEffect } from './react.js';
import { clamp } from './util.js';

export function textLang(text) {
  const s = String(text || '');
  if (/[ӘәҒғҚқҢңӨөҰұҮүҺһ]/.test(s)) return 'kk';
  const cyr = (s.match(/[А-Яа-яЁё]/g) || []).length, lat = (s.match(/[A-Za-z]/g) || []).length;
  return lat > cyr ? 'en' : 'ru';
}
const SPEECH = { kk: 'kk', ru: 'ru', en: 'en' };

export function useVoices(lang) {
  const [v, setV] = useState([]);
  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const f = () => setV(speechSynthesis.getVoices().filter(x => x.lang && x.lang.toLowerCase().startsWith(SPEECH[lang] || 'ru')));
    f();
    speechSynthesis.addEventListener('voiceschanged', f);
    return () => speechSynthesis.removeEventListener('voiceschanged', f);
  }, [lang]);
  return v;
}
export const vScore = v => (/natural|neural|online/i.test(v.name) ? 5 : 0)
  + (/google|yandex|siri|milena|svetlana|dmitry|alena|katya|irina|pavel|yuri|aigul|daulet/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);

export function stopSpeak() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} }

export function speak(d, voice) {
  stopSpeak();
  if (!window.speechSynthesis) return;
  const vo = d.style.voice, lang = textLang(d.text);
  const parts = d.text.match(/[^.!?…\n]+[.!?…]*/g) || [d.text];
  parts.forEach((p, i) => {
    const t = p.trim(); if (!t) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-US' }[lang];
    if (voice) u.voice = voice;
    u.rate = vo.rate * (i % 2 ? .96 : 1);
    u.pitch = clamp(vo.pitch + (/!/.test(t) ? .08 : 0) - (/[.…]$/.test(t) ? .03 : 0), .5, 1.6);
    speechSynthesis.speak(u);
  });
}
