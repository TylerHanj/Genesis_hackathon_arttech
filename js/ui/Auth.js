/* Вход и регистрация. Ошибки нейтральные: не раскрывают, существует ли email (S12). */
import { html, useState } from '../lib/react.js';
import { auth, MIN_PASSWORD, AppError } from '../lib/backend.js';
import { useT } from '../i18n/index.js';

export function Auth({ onUser }) {
  const t = useT();
  const [m, setM] = useState('in'), [e, setE] = useState(''), [p, setP] = useState(''), [show, setShow] = useState(false);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  async function go(ev) {
    ev.preventDefault(); setMsg(null);
    if (m === 'up' && p.length < MIN_PASSWORD) { setMsg({ kind: 'err', key: 'auth.pwShort' }); return; }
    if (!p) return;
    setBusy(true);
    try {
      const r = await (m === 'in' ? auth.signIn(e.trim(), p) : auth.signUp(e.trim(), p));
      if (r === 'confirm') { setMsg({ kind: 'ok', key: 'auth.confirm' }); setM('in'); setP(''); } else onUser(r);
    } catch (x) { setMsg({ kind: 'err', key: x instanceof AppError ? x.key : 'error.generic' }); }
    setBusy(false);
  }
  const toggle = () => { setM(m === 'in' ? 'up' : 'in'); setMsg(null); };
  return html`<form class="card form auth" onSubmit=${go}>
    <h2>${m === 'in' ? t('auth.signin') : t('auth.signup')}</h2>
    <label>${t('auth.email')}<input type="email" required maxLength="254" autoComplete="email" value=${e} onChange=${x => setE(x.target.value)}/></label>
    <label>${t('auth.password')}
      <span class="pw">
        <input type=${show ? 'text' : 'password'} required maxLength="128" minLength=${m === 'up' ? MIN_PASSWORD : undefined}
          autoComplete=${m === 'in' ? 'current-password' : 'new-password'} value=${p} onChange=${x => setP(x.target.value)}/>
        <button type="button" class="pw-toggle" aria-pressed=${show} onClick=${() => setShow(!show)}
          aria-label=${show ? t('auth.hideLabel') : t('auth.showLabel')}>${show ? t('auth.hide') : t('auth.show')}</button>
      </span>
    </label>
    ${msg && html`<div class=${msg.kind === 'err' ? 'err' : 'ok'} role=${msg.kind === 'err' ? 'alert' : 'status'}>${t(msg.key, { n: MIN_PASSWORD })}</div>`}
    <div class="bar">
      <button class="btn" disabled=${busy}>${busy ? t('auth.busy') : m === 'in' ? t('auth.submitIn') : t('auth.submitUp')}</button>
      <button type="button" class="btn ghost" onClick=${toggle}>${m === 'in' ? t('auth.toUp') : t('auth.toIn')}</button>
    </div>
  </form>`;
}
