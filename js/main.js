/* Точка входа. Библиотеки лежат в /vendor и подключены в index.html. */
const root = document.getElementById('root');
if (!window.React || !window.ReactDOM || !window.htm) {
  root.textContent = 'Не удалось загрузить страницу. Обновите её. · Бетті жүктеу мүмкін болмады. Жаңартыңыз. · The page failed to load. Please reload.';
} else {
  const { html } = await import('./lib/react.js');
  const { App } = await import('./ui/App.js');
  window.ReactDOM.createRoot(root).render(html`<${App}/>`);
}
