/* Меню «≡» в правом верхнем углу: язык, тема, аккаунт; на телефоне — ещё и разделы сайта. */
import { html, useState, useEffect, useRef } from '../lib/react.js';
import { LANGS, useT } from '../i18n/index.js';

export function Menu({ lang, setLang, theme, setTheme, palette, setPalette, user, onLogout, onPassword, nav }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef(null), btn = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const out = e => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') { setOpen(false); btn.current && btn.current.focus(); } };
    document.addEventListener('pointerdown', out); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key); };
  }, [open]);
  const pick = fn => (...a) => { fn(...a); };
  return html`<div class="menu" ref=${root}>
    <button ref=${btn} class="menu-btn" aria-haspopup="true" aria-expanded=${open} aria-controls="app-menu" onClick=${() => setOpen(!open)}>
      <span class="burger" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">${t('menu.open')}</span>
    </button>
    ${open && html`<div id="app-menu" class="menu-pop" role="group" aria-label=${t('menu.open')}>
      ${nav && html`<nav class="menu-nav" aria-label=${t('nav.main')}>${nav.map(n => html`<button key=${n.key} class=${n.on ? 'on' : ''} aria-current=${n.on ? 'page' : undefined} onClick=${() => { n.go(); setOpen(false); }}>${n.label}</button>`)}</nav>`}
      <div class="menu-sec"><span class="menu-h" id="m-lang">${t('menu.language')}</span>
        <div class="seg" role="group" aria-labelledby="m-lang">${LANGS.map(l => html`<button key=${l.code} lang=${l.code} aria-pressed=${lang === l.code} title=${l.label} onClick=${pick(() => setLang(l.code))}>${l.short}</button>`)}</div></div>
      <div class="menu-sec"><span class="menu-h" id="m-pal">${t('menu.palette')}</span>
        <div class="seg" role="group" aria-labelledby="m-pal">${['warm', 'olive'].map(k => html`<button key=${k} aria-pressed=${palette === k} onClick=${() => setPalette(k)}>
          <span class=${'sw sw-' + k} aria-hidden="true"><i></i><i></i><i></i></span>${t('palette.' + k)}</button>`)}</div></div>
      <div class="menu-sec"><span class="menu-h" id="m-theme">${t('menu.theme')}</span>
        <div class="seg" role="group" aria-labelledby="m-theme">${['light', 'dark', 'auto'].map(k => html`<button key=${k} aria-pressed=${theme === k} onClick=${pick(() => setTheme(k))}>${t('theme.' + k)}</button>`)}</div></div>
      ${user && html`<div class="menu-sec"><span class="menu-h">${t('menu.account')}</span><span class="menu-mail">${user.email}</span>
        <div class="menu-acc">${onPassword && html`<button class="btn ghost" onClick=${() => { setOpen(false); onPassword(); }}>${t('auth.changePw')}</button>`}
        <button class="btn ghost" onClick=${() => { setOpen(false); onLogout(); }}>${t('nav.logout')}</button></div></div>`}
    </div>`}
  </div>`;
}
