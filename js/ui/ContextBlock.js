/* =====================================================================
   «Контекст дня» в форме: погода, место, время съёмки. Всё выключено по умолчанию,
   запросы к внешним сервисам — только после включения переключателя (это и есть согласие).
   ===================================================================== */
import { html, useState, useEffect, useRef } from '../lib/react.js';
import { geocodeCity, detectPosition, cityName, weatherFor, readExifTime } from '../lib/context.js';
import { useT } from '../i18n/index.js';
import { WeatherIcon } from './Icons.js';

function Switch({ on, onChange, label, hint, id, children }) {
  return html`<div class="ctx-row">
    <button type="button" role="switch" class=${'sw2' + (on ? ' on' : '')} aria-checked=${on} aria-labelledby=${id} aria-describedby=${id + '-h'} onClick=${() => onChange(!on)}></button>
    <div><b id=${id}>${label}</b><p id=${id + '-h'}>${hint}</p>${children}</div>
  </div>`;
}

/* value: { place, weather, hour } (как сохраняется в записи); files — новые фото (для времени съёмки) */
export function ContextBlock({ value, onChange, date, setDate, files }) {
  const t = useT();
  const v = value || {};
  const [placeOn, setPlaceOn] = useState(!!v.place), [weatherOn, setWeatherOn] = useState(!!v.weather), [timeOn, setTimeOn] = useState(v.hour != null);
  const [city, setCity] = useState(v.place || ''), [geo, setGeo] = useState(v.place ? { name: v.place } : null);
  const [weather, setWeather] = useState(v.weather || null), [shot, setShot] = useState(null);
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const req = useRef(0);

  useEffect(() => {
    onChange({ ...(placeOn && geo ? { place: geo.name } : {}), ...(weatherOn && weather ? { weather } : {}), ...(timeOn && shot ? { hour: shot.hour } : (timeOn && v.hour != null ? { hour: v.hour } : {})) });
  }, [placeOn, weatherOn, timeOn, geo, weather, shot]);

  const findCity = async () => {
    const q = city.trim();
    if (!q || (geo && geo.name === q && geo.lat != null)) return geo;
    setBusy(true); setStatus('');
    const g = await geocodeCity(q, t.lang);
    setBusy(false);
    if (!g) { setGeo(null); setStatus(t('ctx.notFound')); return null; }
    setGeo(g); setCity(g.name); return g;
  };
  const detect = async () => {
    setBusy(true); setStatus('');
    const p = await detectPosition();
    if (p.error) { setBusy(false); setStatus(t(p.error === 'denied' ? 'ctx.geoDenied' : 'ctx.geoFailed')); return; }
    const n = await cityName(p.lat, p.lon, t.lang);
    setBusy(false);
    const name = n || t('ctx.nearYou');
    setGeo({ name, lat: p.lat, lon: p.lon }); setCity(name);
  };

  /* погода: когда включена, есть город и дата */
  useEffect(() => {
    if (!weatherOn) { setWeather(null); return; }
    if (!placeOn || !city.trim()) { setStatus(t('ctx.needCity')); return; }
    if (!(geo && geo.lat != null)) { findCity(); return; }                // координаты появятся → эффект запустится снова
    const my = ++req.current;
    (async () => {
      setBusy(true); setStatus(t('ctx.loading'));
      const g = geo;
      const w = await weatherFor(g.lat, g.lon, date);
      if (my !== req.current) return;
      setBusy(false); setWeather(w); setStatus(w ? '' : t('ctx.noWeather'));
    })();
  }, [weatherOn, placeOn, geo && geo.lat, date]);

  /* время съёмки: только из новых JPEG, до перекодирования (которое удаляет EXIF) */
  useEffect(() => {
    if (!timeOn) { setShot(null); return; }
    (async () => {
      let found = null;
      for (const f of files) { const x = await readExifTime(f); if (x && (!found || x.date < found.date)) found = x; }
      setShot(found);
    })();
  }, [timeOn, files.map(f => f.name + f.size).join('|')]);

  const preview = [weatherOn && weather ? `${weather.t != null ? (weather.t > 0 ? '+' : '') + weather.t + '° · ' : ''}${t('weather.' + weather.kind)}` : null,
    placeOn && geo ? geo.name : null, date ? t.date(date) : null].filter(Boolean);

  return html`<details class="advanced ctx" open=${!!(v.place || v.weather || v.hour != null)}>
    <summary>${t('ctx.title')}<span class="hint">${t('ctx.hint')}</span></summary>
    <div class="adv-body">
      <${Switch} id="ctx-w" on=${weatherOn} onChange=${on => { setWeatherOn(on); if (on) setPlaceOn(true); }} label=${t('ctx.weather')} hint=${t('ctx.weatherHint')}/>
      <${Switch} id="ctx-p" on=${placeOn} onChange=${on => { setPlaceOn(on); if (!on) setWeatherOn(false); }} label=${t('ctx.place')} hint=${t('ctx.placeHint')}>
        ${placeOn && html`<div class="city">
          <input type="text" maxLength="80" value=${city} placeholder=${t('ctx.cityPh')} aria-label=${t('ctx.cityPh')}
            onChange=${e => { setCity(e.target.value); setGeo(null); }} onBlur=${findCity} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); findCity(); } }}/>
          <button type="button" class="btn ghost" disabled=${busy} onClick=${detect}>${t('ctx.detect')}</button>
        </div>`}
      <//>
      <${Switch} id="ctx-t" on=${timeOn} onChange=${setTimeOn} label=${t('ctx.photoTime')} hint=${t('ctx.photoTimeHint')}>
        ${timeOn && (shot
          ? html`<p class="ctx-shot">${t('ctx.photoTimeFound', { when: `${t.date(shot.date)}, ${shot.time}` })}
              ${shot.date !== date && html` <button type="button" class="link-btn" onClick=${() => setDate(shot.date)}>${t('ctx.useDate')}</button>`}</p>`
          : html`<p class="ctx-shot muted">${files.length ? t('ctx.photoTimeNone') : t('ctx.photoTimeNoFiles')}</p>`)}
      <//>
      ${status && html`<p class="ctx-status" role="status">${status}</p>`}
      ${(preview.length > 1 || (weatherOn && weather)) && html`<div class="preview">${weatherOn && weather && html`<${WeatherIcon} kind=${weather.kind}/>`}${preview.join(' · ')}</div>`}
    </div>
  </details>`;
}
