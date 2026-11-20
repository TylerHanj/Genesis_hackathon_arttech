/* Оболочка приложения: вход, раскладка с боковой панелью (макет со скриншота 2), разделы. */
import { html, useState, useEffect, useMemo, useRef } from '../lib/react.js';
import { ls, uid } from '../lib/util.js';
import { sb, auth, store, AppError } from '../lib/backend.js';
import { seedDays } from '../core/demo.js';
import { I18n, makeT, detectLang, isLang } from '../i18n/index.js';
import { Auth } from './Auth.js';
import { DayForm } from './DayForm.js';
import { Folder } from './Folder.js';
import { MemoryMap, defaultCats, resetMapView } from './MemoryMap.js';
import { SidePanel } from './SidePanel.js';
import { About } from './About.js';
import { Menu } from './Menu.js';

function useTheme() {
  const [pref, setPref] = useState(() => { const p = ls.get('dd-theme', 'auto'); return ['light', 'dark', 'auto'].includes(p) ? p : 'auto'; });
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.setAttribute('data-theme', pref === 'auto' ? (mq.matches ? 'dark' : 'light') : pref);
    apply(); ls.set('dd-theme', pref);
    if (pref !== 'auto') return undefined;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
  return [pref, setPref];
}

function Brand({ t, as = 'h1' }) {
  const H = as;
  return html`<div class="brand"><${H} class="brand-name">${t('app.title')}</${H}><span class="brand-tag">${t('app.tagline')}</span></div>`;
}

export function App() {
  const [lang, setLangState] = useState(() => detectLang(ls.get('dd-lang', '')));
  const t = useMemo(() => makeT(lang), [lang]);
  const setLang = l => { if (isLang(l)) { setLangState(l); ls.set('dd-lang', l); } };
  useEffect(() => { document.documentElement.lang = lang; document.title = `${t('app.title')} — ${t('app.tagline')}`; }, [lang]);
  const [theme, setTheme] = useTheme();

  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState('map'), [open, setOpen] = useState(null), [note, setNote] = useState('');
  const [days, setDays] = useState([]), [meta, setMeta] = useState({ cats: [], layout: {} }), [loaded, setLoaded] = useState(false);
  const metaRef = useRef(meta); metaRef.current = meta;

  useEffect(() => {
    if (!sb) return undefined;
    auth.session().then(setUser, () => setUser(null));
    return auth.onChange((event, u) => {
      if (event === 'SIGNED_OUT') setUser(null);
      else if (u) setUser(prev => (prev && prev.id === u.id ? prev : u));
    });
  }, []);

  useEffect(() => {
    setLoaded(false); setNote('');
    if (!user) { setDays([]); setMeta({ cats: [], layout: {} }); return; }
    let alive = true;
    store.load(user.id).then(r => {
      if (!alive) return;
      setDays(r.days);
      const cats = r.cats || defaultCats(t);
      setMeta({ cats, layout: r.layout });
      if (!r.cats) store.saveMeta(user.id, cats, r.layout).catch(fail);
      setTab(r.days.length ? 'map' : 'new'); setLoaded(true);
    }).catch(e => { if (alive) { setNote(e instanceof AppError ? e.key : 'error.load'); setLoaded(true); } });
    return () => { alive = false; };
  }, [user && user.id]);

  const fail = e => setNote(e instanceof AppError ? e.key : 'error.save');
  const saveDay = d => { setNote(''); setDays(x => (x.some(y => y.id === d.id) ? x.map(y => (y.id === d.id ? d : y)) : [...x, d])); store.saveDay(user.id, d).catch(fail); };
  const saveMeta = part => {
    const next = { ...metaRef.current, ...part }; metaRef.current = next; setMeta(next);
    store.saveMeta(user.id, next.cats, next.layout).catch(fail);
  };
  const del = id => {
    setDays(x => x.filter(y => y.id !== id)); setOpen(null);
    store.remove(user.id, id).catch(fail);
    if (metaRef.current.layout[id]) { const { [id]: _, ...rest } = metaRef.current.layout; saveMeta({ layout: rest }); }
  };
  const demo = async () => { for (const d of await seedDays(uid)) saveDay(d); };
  const sort = () => {
    const layout = {};
    days.forEach(d => { if (d.pos || d.cat !== undefined) layout[d.id] = { auto: true }; });  // старые ручные места тоже сбрасываются
    saveMeta({ layout });
  };
  const logout = async () => { await auth.signOut(); resetMapView(); setOpen(null); setUser(null); };

  const go = k => { setTab(k); setOpen(null); };
  const cur = days.find(d => d.id === open);
  const NAV = [['map', 'nav.map'], ['new', 'nav.new'], ['about', 'nav.about']];
  const navItems = NAV.map(([k, l]) => ({ key: k, label: t(l), on: tab === k && !cur, go: () => go(k) }));
  const menu = html`<${Menu} lang=${lang} setLang=${setLang} theme=${theme} setTheme=${setTheme} user=${user} onLogout=${logout} nav=${user ? navItems : null}/>`;

  let body;
  if (!sb) {
    body = html`<div class="center-screen"><${Brand} t=${t}/><p class="err" role="alert">${t('service.down')}</p></div>`;
  } else if (user === undefined) {
    body = html`<div class="center-screen" aria-busy="true"><${Brand} t=${t}/><p class="muted">${t('loading')}</p></div>`;
  } else if (!user) {
    body = html`<div class="auth-screen">
      <header class="auth-top"><${Brand} t=${t}/>${menu}</header>
      <main id="main"><${Auth} onUser=${setUser}/></main>
    </div>`;
  } else {
    const navBtn = n => html`<button key=${n.key} class=${'nav-btn' + (n.on ? ' on' : '')} aria-current=${n.on ? 'page' : undefined} onClick=${n.go}>${n.label}</button>`;
    let content;
    if (!loaded) content = html`<div class="skeleton" aria-busy="true" aria-label=${t('loading')}></div>`;
    else if (cur) content = html`<${Folder} key=${cur.id} d=${cur} onBack=${() => setOpen(null)} onSave=${saveDay} onDelete=${del}/>`;
    else if (tab === 'new') content = html`<${DayForm} onSave=${d => { saveDay(d); setTab('map'); setOpen(d.id); }}/>`;
    else if (tab === 'map') content = html`<${MemoryMap} days=${days} cats=${meta.cats} layout=${meta.layout} onOpen=${setOpen} onMeta=${saveMeta} onSort=${sort} onSeed=${demo}/>`;
    else content = html`<${About}/>`;
    body = html`<div class="shell">
      <aside class="side">
        <${Brand} t=${t}/>
        <nav class="nav nav-primary" aria-label=${t('nav.main')}>${navItems.slice(0, 2).map(navBtn)}</nav>
        <${SidePanel} days=${days} onOpen=${setOpen} idPrefix="sp"/>
        <nav class="nav nav-secondary" aria-label=${t('nav.about')}>${navBtn(navItems[2])}<button class="nav-btn" onClick=${logout} title=${user.email}>${t('nav.logout')}</button></nav>
      </aside>
      <div class="main-col">
        <header class="topbar"><div class="topbar-brand"><${Brand} t=${t} as="p"/></div>${menu}</header>
        <main id="main" tabIndex="-1">
          ${note && html`<p class="err banner" role="alert">${t(note)}</p>`}
          ${content}
        </main>
        ${tab === 'map' && !cur && html`<div class="side-mobile"><${SidePanel} days=${days} onOpen=${setOpen} idPrefix="spm"/></div>`}
      </div>
    </div>`;
  }
  return html`<${I18n.Provider} value=${t}><a class="skip" href="#main">${t('skip')}</a>${body}<//>`;
}
