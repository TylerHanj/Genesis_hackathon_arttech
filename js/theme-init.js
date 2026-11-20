/* Ставит тему до первой отрисовки, чтобы не было вспышки светлого экрана. Отдельный файл — из-за CSP (без inline-скриптов). */
(function () {
  var pref = 'auto';
  try { pref = JSON.parse(localStorage.getItem('dd-theme')) || 'auto'; } catch (e) {}
  if (pref !== 'light' && pref !== 'dark') {
    pref = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', pref);
  var lang = 'ru';
  try { lang = JSON.parse(localStorage.getItem('dd-lang')) || ''; } catch (e) {}
  if (['kk', 'ru', 'en'].indexOf(lang) < 0) {
    var nav = (navigator.languages || [navigator.language || 'ru']).map(function (l) { return String(l).slice(0, 2).toLowerCase(); });
    lang = nav.filter(function (l) { return l === 'kk' || l === 'ru' || l === 'en'; })[0] || 'ru';
  }
  document.documentElement.lang = lang;
})();
