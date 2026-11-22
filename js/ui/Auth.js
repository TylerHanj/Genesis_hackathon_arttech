/* =====================================================================
   Вход, регистрация, восстановление пароля.
   - Слева (на телефоне — сверху) витрина: настоящие кадры дней (Scene) с демо-картинками, карта настроения
     с плавающей точкой и коротко — что умеет дневник. Всё декоративное скрыто от экранных читалок.
   - Справа форма: вкладки «Вход / Регистрация», показ пароля, индикатор надёжности, «Забыли пароль?».
   - Восстановление: письмо со ссылкой → экран «Новый пароль» (NewPassword) → вход в дневник.
   Безопасность: ответы нейтральные (не раскрывают, есть ли такой email), повторная отправка письма — не чаще раза
   в 60 секунд, пароль не короче MIN_PASSWORD, весь текст — через React.
   ===================================================================== */
import { html, useState, useEffect, useMemo } from '../lib/react.js';
import { auth, MIN_PASSWORD, AppError } from '../lib/backend.js';
import { makeDay } from '../core/analysis.js';
import { useT } from '../i18n/index.js';
import { Scene } from './Scene.js';
import { MoodFace } from './MoodFace.js';
import { Icon } from './Icons.js';

/* ---------- надёжность пароля: 0…4 ---------- */
export function pwScore(p) {
  let s = 0;
  if (p.length >= MIN_PASSWORD) s++;
  if (p.length >= 12) s++;
  if (/\p{L}/u.test(p) && /\d/.test(p)) s++;
  if ((/\p{Lu}/u.test(p) && /\p{Ll}/u.test(p)) || /[^\p{L}\d\s]/u.test(p)) s++;
  return p.length < MIN_PASSWORD ? Math.min(s, 1) : s;
}
function PwMeter({ p }) {
  const t = useT(), s = pwScore(p), lvl = ['weak', 'weak', 'fair', 'good', 'strong'][s];
  const rules = [[p.length >= MIN_PASSWORD, t('auth.rLen', { n: MIN_PASSWORD })], [/\p{L}/u.test(p) && /\d/.test(p), t('auth.rMix')]];
  return html`<div class="pw-meter">
    <div class=${'pw-bar s' + s} role="img" aria-label=${t('auth.strength', { v: t('auth.s.' + lvl) })}><i></i><i></i><i></i><i></i></div>
    <span class="pw-lvl" aria-live="polite">${p ? t('auth.s.' + lvl) : ''}</span>
    <ul class="pw-rules">${rules.map(([ok, txt], i) => html`<li key=${i} class=${ok ? 'ok' : ''}><span aria-hidden="true">${ok ? '✓' : '•'}</span>${txt}</li>`)}</ul>
  </div>`;
}
function Password({ value, onChange, autoComplete, id, label, describedBy }) {
  const t = useT(), [show, setShow] = useState(false);
  return html`<label for=${id}>${label}
    <span class="pw">
      <input id=${id} type=${show ? 'text' : 'password'} required maxLength="128" autoComplete=${autoComplete} value=${value}
        aria-describedby=${describedBy} onChange=${x => onChange(x.target.value)} enterKeyHint="go"/>
      <button type="button" class="pw-toggle" aria-pressed=${show} onClick=${() => setShow(!show)}
        aria-label=${show ? t('auth.hideLabel') : t('auth.showLabel')}>${show ? t('auth.hide') : t('auth.show')}</button>
    </span>
  </label>`;
}

/* ---------- витрина ---------- */
const svg = (c, seed) => {
  let o = '', x = seed;
  const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 8; i++) o += `<circle cx="${r() * 400}" cy="${r() * 600}" r="${30 + r() * 110}" fill="${c[2]}" opacity="${.12 + r() * .3}"/>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/>${o}</svg>`);
};
const DEMO = [
  ['2026-10-18', 'Гуляли по парку, всё в жёлтых листьях, пили какао.', { valence: .55, energy: -.45 }, ['#f2c27b', '#b5651d', '#fff3d6']],
  ['2026-07-14', 'С друзьями у моря: ярко, смех, солнце, танцы до заката.', { valence: .8, energy: .7 }, ['#7cc6e6', '#e98a6b', '#fff7c2']],
  ['2026-11-09', 'Весь вечер шёл дождь, было тихо, я смотрел в окно.', { valence: -.55, energy: -.5 }, ['#8b9bb4', '#3b4660', '#d8e2f0']],
];
export function AuthHero() {
  const t = useT();
  const days = useMemo(() => DEMO.map(([date, text, mood, c], i) => {
    const d = makeDay({ date, text, photos: [{ h: 30, s: .3, l: .5, warm: 0 }], song: {}, mood, newId: () => 'demo' + i });
    return { ...d, photos: [{ url: svg(c, 17 + i * 31), h: 30, s: .3, l: .5, warm: 0 }] };
  }), []);
  return html`<section class="auth-hero" aria-labelledby="hero-h">
    <h2 id="hero-h">${t('hero.title1')} <em>${t('hero.title2')}</em></h2>
    <p class="hero-lead">${t('hero.lead')}</p>
    <div class="hero-art" aria-hidden="true">
      <span class="hero-ring r1"></span><span class="hero-ring r2"></span><span class="hero-ring r3"></span>
      ${days.map((d, i) => html`<div key=${i} class=${'hero-card c' + i}><${Scene} d=${d} live=${false}/></div>`)}
      <div class="hero-mood">
        <span class="hm-axis"></span><span class="hm-axis v"></span>
        <span class="hm-dot"></span>
        <span class="hm-face f1"><${MoodFace} v=${.7} e=${.6}/></span><span class="hm-face f2"><${MoodFace} v=${-.6} e=${-.5}/></span>
      </div>
    </div>
    <ul class="hero-points">
      <li><${Icon} name="camera"/><span>${t('hero.p1')}</span></li>
      <li><${Icon} name="map"/><span>${t('hero.p2')}</span></li>
      <li><${Icon} name="calendar"/><span>${t('hero.p3')}</span></li>
    </ul>
  </section>`;
}

/* ---------- форма ---------- */
export function Auth({ onUser, linkError }) {
  const t = useT();
  const [m, setM] = useState(linkError ? 'reset' : 'in'), [e, setE] = useState(''), [p, setP] = useState('');
  const [msg, setMsg] = useState(linkError ? { kind: 'err', key: 'auth.linkExpired' } : null), [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);                                  // секунд до повторной отправки письма
  useEffect(() => { if (wait <= 0) return undefined; const tm = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(tm); }, [wait]);
  const mode = k => { setM(k); setMsg(null); };

  async function go(ev) {
    ev.preventDefault(); setMsg(null);
    const email = e.trim();
    if (m === 'reset' || m === 'sent') {
      if (!email || wait > 0) return;
      setBusy(true);
      try { await auth.resetPassword(email); setM('sent'); setWait(60); } catch (x) { setMsg({ kind: 'err', key: x instanceof AppError ? x.key : 'error.generic' }); }
      setBusy(false); return;
    }
    if (m === 'up' && p.length < MIN_PASSWORD) { setMsg({ kind: 'err', key: 'auth.pwShort' }); return; }
    if (!p) return;
    setBusy(true);
    try {
      const r = await (m === 'in' ? auth.signIn(email, p) : auth.signUp(email, p));
      if (r === 'confirm') { setMsg({ kind: 'ok', key: 'auth.confirm' }); setM('in'); setP(''); } else onUser(r);
    } catch (x) { setMsg({ kind: 'err', key: x instanceof AppError ? x.key : 'error.generic' }); }
    setBusy(false);
  }

  const head = { in: 'auth.helloIn', up: 'auth.helloUp', reset: 'auth.resetTitle', sent: 'auth.sentTitle' }[m];
  const sub = { in: 'auth.subIn', up: 'auth.subUp', reset: 'auth.resetSub', sent: null }[m];
  const emailField = html`<label for="au-email">${t('auth.email')}
    <span class="au-in"><${Icon} name="mail" size=${18}/><input id="au-email" type="email" required maxLength="254" autoComplete="email" inputMode="email"
      autoCapitalize="none" spellCheck=${false} enterKeyHint=${m === 'reset' ? 'send' : 'next'} value=${e} onChange=${x => setE(x.target.value)}/></span></label>`;

  return html`<form class="card form auth" onSubmit=${go} noValidate=${false}>
    ${(m === 'in' || m === 'up') && html`<div class="seg au-tabs" role="group" aria-label=${t('auth.modeLabel')}>
      <button type="button" aria-pressed=${m === 'in'} onClick=${() => mode('in')}>${t('auth.signin')}</button>
      <button type="button" aria-pressed=${m === 'up'} onClick=${() => mode('up')}>${t('auth.signup')}</button>
    </div>`}
    ${m === 'sent' && html`<div class="au-mail" aria-hidden="true"><${Icon} name="mail" size=${34}/></div>`}
    <h2>${t(head)}</h2>
    ${sub && html`<p class="muted au-sub">${t(sub)}</p>`}
    ${m === 'sent'
      ? html`<p class="au-sent" role="status">${t('auth.sentText', { email: e.trim() })}</p>
          <p class="muted small">${t('auth.sentHint')}</p>`
      : emailField}
    ${(m === 'in' || m === 'up') && html`
      <${Password} id="au-pw" value=${p} onChange=${setP} autoComplete=${m === 'in' ? 'current-password' : 'new-password'}
        label=${t('auth.password')} describedBy=${m === 'up' ? 'au-meter' : undefined}/>
      ${m === 'in' && html`<button type="button" class="linkish au-forgot" onClick=${() => mode('reset')}>${t('auth.forgot')}</button>`}
      ${m === 'up' && html`<div id="au-meter"><${PwMeter} p=${p}/></div>`}`}
    ${msg && html`<div class=${msg.kind === 'err' ? 'err' : 'ok'} role=${msg.kind === 'err' ? 'alert' : 'status'}>${t(msg.key, { n: MIN_PASSWORD })}</div>`}
    <button class="btn au-submit" disabled=${busy || ((m === 'sent' || m === 'reset') && wait > 0)}>${busy ? t('auth.busy')
      : m === 'in' ? t('auth.submitIn') : m === 'up' ? t('auth.submitUp')
      : wait > 0 ? t('auth.resendIn', { s: wait }) : m === 'reset' ? t('auth.sendLink') : t('auth.resend')}</button>
    ${(m === 'reset' || m === 'sent') && html`<button type="button" class="linkish au-back" onClick=${() => mode('in')}>← ${t('auth.backToIn')}</button>`}
    ${m === 'up' && html`<p class="muted small au-note"><${Icon} name="lock" size=${14}/>${t('auth.privacy')}</p>`}
  </form>`;
}

/* ---------- новый пароль: после ссылки из письма или из меню ---------- */
export function NewPassword({ mode = 'recovery', onDone, onCancel }) {
  const t = useT();
  const [p, setP] = useState(''), [p2, setP2] = useState(''), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  async function go(ev) {
    ev.preventDefault(); setMsg(null);
    if (p.length < MIN_PASSWORD) { setMsg({ key: 'auth.pwShort' }); return; }
    if (p !== p2) { setMsg({ key: 'auth.pwMismatch' }); return; }
    setBusy(true);
    try { await auth.setPassword(p); setDone(true); } catch (x) { setMsg({ key: x instanceof AppError ? x.key : 'error.generic' }); }
    setBusy(false);
  }
  if (done) return html`<div class="card form auth au-done" role="status">
    <div class="au-mail ok" aria-hidden="true"><${Icon} name="check" size=${34}/></div>
    <h2>${t('auth.pwChanged')}</h2><p class="muted">${t(mode === 'recovery' ? 'auth.pwChangedRec' : 'auth.pwChangedText')}</p>
    <button class="btn au-submit" onClick=${onDone}>${t('auth.toDiary')}</button>
  </div>`;
  return html`<form class="card form auth" onSubmit=${go}>
    <h2>${t(mode === 'recovery' ? 'auth.newPwTitle' : 'auth.changePw')}</h2>
    <p class="muted au-sub">${t(mode === 'recovery' ? 'auth.newPwSub' : 'auth.changePwSub')}</p>
    <${Password} id="np-1" value=${p} onChange=${setP} autoComplete="new-password" label=${t('auth.newPw')} describedBy="np-meter"/>
    <div id="np-meter"><${PwMeter} p=${p}/></div>
    <${Password} id="np-2" value=${p2} onChange=${setP2} autoComplete="new-password" label=${t('auth.newPw2')}/>
    ${msg && html`<div class="err" role="alert">${t(msg.key, { n: MIN_PASSWORD })}</div>`}
    <button class="btn au-submit" disabled=${busy}>${busy ? t('auth.busy') : t('auth.savePw')}</button>
    ${onCancel && html`<button type="button" class="linkish au-back" onClick=${onCancel}>${t(mode === 'recovery' ? 'auth.cancelRec' : 'cancel')}</button>`}
  </form>`;
}
