/* Shared by the offline launcher and the React application. No backend required. */
(() => {
  const params = new URLSearchParams(window.location.search);
  if (!window.__desktopShell && !(Number(params.get('startupEpoch')) > 0)) return;
  if (document.querySelector('.desktop-titlebar')) return;
  const root = document.documentElement;
  root.dataset.desktop = 'true';
  const bar = document.createElement('header');
  bar.className = 'desktop-titlebar';
  bar.setAttribute('aria-label', 'Application window');
  const icons = {
    minimize: '<path d="M3 7h8"/>',
    maximize: '<rect x="3" y="3" width="8" height="8"/>',
    restore: '<path d="M5 3V2h7v7h-1"/><rect x="2" y="5" width="7" height="7"/>',
    close: '<path d="m3 3 8 8M11 3l-8 8"/>'
  };
  const svg = name => `<svg viewBox="0 0 14 14" aria-hidden="true">${icons[name]}</svg>`;
  bar.innerHTML = `<div class="desktop-titlebar-brand"><img alt="" draggable="false"><span class="desktop-titlebar-name">Iraq Data Analysis</span><span class="desktop-titlebar-version" hidden></span></div><div class="desktop-titlebar-controls"><button type="button" data-action="minimize" aria-label="Minimize" title="Minimize">${svg('minimize')}</button><button type="button" data-action="maximize" aria-label="Maximize" title="Maximize">${svg('maximize')}</button><button type="button" data-action="close" class="desktop-titlebar-close" aria-label="Close" title="Close">${svg('close')}</button></div>`;
  bar.querySelector('img').src = window.__desktopIcon || '/intersos-symbol-transparent.png';
  document.body.append(bar);
  const maximize = bar.querySelector('[data-action="maximize"]');
  let state = {maximized: true, fullscreen: false};
  let renderedState = '';
  let busy = false;
  const api = () => window.pywebview?.api;
  function update(next) {
    if (!next) return;
    state = next;
    const signature = JSON.stringify([!!state.maximized, !!state.fullscreen, state.version, !!state.nativeDrag]);
    if (signature === renderedState) return;
    renderedState = signature;
    root.dataset.desktopNativeDrag = String(!!state.nativeDrag);
    root.dataset.desktopMaximized = String(!!state.maximized);
    root.dataset.desktopFullscreen = String(!!state.fullscreen);
    maximize.innerHTML = svg(state.maximized ? 'restore' : 'maximize');
    const label = state.maximized ? 'Restore down' : 'Maximize';
    maximize.setAttribute('aria-label', label);
    maximize.title = label;
    if (state.version) {
      const badge = bar.querySelector('.desktop-titlebar-version');
      badge.textContent = `v${state.version}`;
      badge.hidden = false;
    }
  }
  async function refresh() {
    try { update(await api()?.get_window_state()); } catch { /* Retry on focus or resize. */ }
    bar.querySelectorAll('button').forEach(button => { button.disabled = !api()?.get_window_state; });
  }
  async function action(name) {
    if (busy || !api()) return;
    busy = true;
    try {
      if (name === 'minimize') await api().minimize_window();
      if (name === 'maximize') update(await api().toggle_maximize_window());
      if (name === 'close') await api().close_window();
    } catch { /* Native window may be closing. Keep controls available to retry. */ }
    finally { busy = false; }
  }
  bar.querySelectorAll('button').forEach(button => button.addEventListener('click', () => action(button.dataset.action)));
  const brand = bar.querySelector('.desktop-titlebar-brand');
  brand.addEventListener('mousedown', event => {
    if (state.nativeDrag || event.button !== 0 || event.detail > 1 || state.fullscreen) return;
    // Wait for a real drag so a double click can maximize without moving.
    const x = event.screenX, y = event.screenY;
    const cleanup = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', cleanup); };
    const move = event => {
      if (Math.abs(event.screenX - x) + Math.abs(event.screenY - y) < 5) return;
      cleanup();
      api()?.begin_window_drag().catch(() => {});
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', cleanup);
  });
  brand.addEventListener('dblclick', () => { if (!state.nativeDrag) void action('maximize'); });
  for (const edge of ['left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const handle = document.createElement('div');
    handle.className = 'desktop-resize';
    handle.dataset.edge = edge;
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('mousedown', event => {
      if (event.button === 0 && !state.maximized && !state.fullscreen) {
        event.preventDefault();
        api()?.begin_window_resize(edge).catch(() => {});
      }
    });
    document.body.append(handle);
  }
  window.addEventListener('pywebviewready', refresh);
  // Native maximize/restore events publish state. Resize drags need no bridge
  // polling; debounce only for older runtimes using the compatibility fallback.
  let resizeTimer;
  window.addEventListener('resize', () => {
    if (state.nativeDrag) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 120);
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('desktopwindowstate', event => update(event.detail));
  update(window.__desktopState || state);
  void refresh();
})();
