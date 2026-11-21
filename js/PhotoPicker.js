import { html } from '../lib/react.js';
import { TECHS } from '../core/analysis.js';
import { useT } from '../i18n/index.js';

export function About() {
  const t = useT();
  return html`<div class="about">
    <div class="card"><h2>${t('sys.idea.h')}</h2><p>${t('sys.idea.p')}</p></div>
    <div class="card"><h2>${t('sys.lang.h')}</h2>
      <p><b>${t('sys.lang.const')}</b> ${t('sys.lang.constP')}</p>
      <p><b>${t('sys.lang.var')}</b> ${t('sys.lang.varP')}</p></div>
    <div class="card"><h2>${t('sys.tech.h')}</h2>
      <table><tbody>${TECHS.map(k => html`<tr key=${k}><th scope="row">${t(`tech.${k}.name`)}</th><td>${t(`tech.${k}.why`)}</td></tr>`)}</tbody></table></div>
    <div class="card"><h2>${t('sys.music.h')}</h2><p>${t('sys.music.p')}</p></div>
    <div class="card"><h2>${t('sys.tools.h')}</h2><p>${t('sys.tools.p')}</p></div>
  </div>`;
}
