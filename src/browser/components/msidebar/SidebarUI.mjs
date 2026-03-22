import { createPanel, sanitizeUrl } from './SidebarModel.mjs';
import { createPanelBrowser, destroyBrowser } from './SidebarPanelHost.mjs';

function createXul(doc, tag) {
  if (doc.createXULElement) return doc.createXULElement(tag);
  return doc.createElement(tag);
}

function ensureStyle(doc) {
  const id = 'midori-msidebar-style';
  if (doc.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = `
:root{--midori-msidebar-width:320px;--midori-msidebar-icons-width:44px;}
#midori-msidebar-root{position:absolute;top:0;bottom:0;width:var(--midori-msidebar-width);display:flex;flex-direction:row;z-index:9999;background:var(--toolbar-bgcolor,rgba(30, 30, 30, 0.95));color:var(--toolbar-color,#fff);border-inline-end:1px solid color-mix(in srgb, currentColor 15%, transparent);}
#midori-msidebar-root[position='left']{left:0;}
#midori-msidebar-root[position='right']{right:0;border-inline-end:0;border-inline-start:1px solid color-mix(in srgb, currentColor 15%, transparent);}
#midori-msidebar-root[hidden]{display:none;}
#midori-msidebar-icons{width:var(--midori-msidebar-icons-width);display:flex;flex-direction:column;align-items:stretch;padding:6px 4px;gap:6px;border-inline-end:1px solid color-mix(in srgb, currentColor 12%, transparent);}
#midori-msidebar-root[position='right'] #midori-msidebar-icons{border-inline-end:0;border-inline-start:1px solid color-mix(in srgb, currentColor 12%, transparent);}
.midori-msidebar-icon{min-width:calc(var(--midori-msidebar-icons-width) - 8px);min-height:34px;padding:0;margin:0;}
#midori-msidebar-panelbox{flex:1;min-width:0;display:flex;flex-direction:column;}
#midori-msidebar-resizer{width:6px;cursor:ew-resize;background:transparent;}
#midori-msidebar-root[position='right'] #midori-msidebar-resizer{cursor:ew-resize;}
#midori-msidebar-root[autohide='true']{width:var(--midori-msidebar-icons-width);}
#midori-msidebar-root[autohide='true']:hover{width:var(--midori-msidebar-width);}
`;
  doc.documentElement.appendChild(style);
}

function resolveMount(doc) {
  return (
    doc.getElementById('appcontent') ||
    doc.getElementById('browser')?.parentNode ||
    doc.getElementById('browser') ||
    doc.documentElement
  );
}

export function createSidebarUI(win, { onStoreChanged } = {}) {
  const doc = win.document;
  ensureStyle(doc);

  const mount = resolveMount(doc);
  if (mount?.style && mount !== doc.documentElement) {
    mount.style.position ||= 'relative';
  }
  const root = createXul(doc, 'hbox');
  root.id = 'midori-msidebar-root';
  root.setAttribute('hidden', 'true');
  root.setAttribute('position', 'left');
  root.setAttribute('autohide', 'false');

  const icons = createXul(doc, 'vbox');
  icons.id = 'midori-msidebar-icons';

  const resizer = createXul(doc, 'vbox');
  resizer.id = 'midori-msidebar-resizer';

  const panelBox = createXul(doc, 'vbox');
  panelBox.id = 'midori-msidebar-panelbox';
  panelBox.setAttribute('flex', '1');

  root.appendChild(icons);
  root.appendChild(resizer);
  root.appendChild(panelBox);

  mount.appendChild(root);

  let store = { panels: [], last: {} };
  let activeBrowser = null;
  let dragging = null;

  function setCssWidth(px) {
    doc.documentElement.style.setProperty('--midori-msidebar-width', `${px}px`);
  }

  function clearPanelBox() {
    if (activeBrowser) {
      destroyBrowser(activeBrowser);
      activeBrowser = null;
    }
    while (panelBox.firstChild) panelBox.firstChild.remove();
  }

  function setActivePanel(panelId) {
    const panel = store.panels.find((p) => p.id === panelId);
    if (!panel) return;
    store.last = store.last || {};
    store.last.selectedPanelId = panel.id;
    clearPanelBox();
    const browser = createPanelBrowser(win, panel);
    activeBrowser = browser;
    panelBox.appendChild(browser);
    renderIcons();
    onStoreChanged?.(store);
  }

  function promptNewPanelUrl() {
    const input = { value: 'https://' };
    const ok = Services.prompt.prompt(win, 'Agregar panel', 'URL del panel:', input, null, {});
    if (!ok) return;
    const url = sanitizeUrl(input.value);
    if (!url) return;
    const panel = createPanel({ url });
    if (!panel) return;
    store.panels.push(panel);
    store.last = store.last || {};
    store.last.selectedPanelId = panel.id;
    onStoreChanged?.(store);
    setActivePanel(panel.id);
  }

  function createIconButton({ id, label, onClick }) {
    const btn = createXul(doc, 'toolbarbutton');
    btn.classList.add('midori-msidebar-icon');
    btn.setAttribute('label', label);
    btn.setAttribute('tooltiptext', label);
    btn.addEventListener('command', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.();
    });
    if (id) btn.id = id;
    return btn;
  }

  function renderIcons() {
    while (icons.firstChild) icons.firstChild.remove();

    const plus = createIconButton({
      id: 'midori-msidebar-add',
      label: '+',
      onClick: promptNewPanelUrl,
    });
    icons.appendChild(plus);

    const selected = store.last?.selectedPanelId;
    for (const panel of store.panels) {
      let label = panel.title;
      if (!label) {
        try {
          label = new URL(panel.url).hostname;
        } catch {
          label = 'Panel';
        }
      }
      const btn = createIconButton({
        id: `midori-msidebar-panel-${panel.id}`,
        label: label.slice(0, 2),
        onClick: () => setActivePanel(panel.id),
      });
      if (panel.id === selected) {
        btn.setAttribute('checked', 'true');
      }
      icons.appendChild(btn);
    }
  }

  function onResizeMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = root.getBoundingClientRect();
    dragging = {
      startX: e.clientX,
      startWidth: rect.width,
      position: root.getAttribute('position'),
    };
    win.addEventListener('mousemove', onResizeMouseMove, true);
    win.addEventListener('mouseup', onResizeMouseUp, true);
  }

  function onResizeMouseMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const width = dragging.position === 'right' ? dragging.startWidth - dx : dragging.startWidth + dx;
    const clamped = Math.min(800, Math.max(200, Math.round(width)));
    setCssWidth(clamped);
    root.setAttribute('data-width', String(clamped));
  }

  function onResizeMouseUp() {
    win.removeEventListener('mousemove', onResizeMouseMove, true);
    win.removeEventListener('mouseup', onResizeMouseUp, true);
    const width = Number.parseInt(root.getAttribute('data-width') || '', 10);
    if (Number.isFinite(width)) {
      try {
        Services.prefs.setIntPref('midori.msidebar.width', width);
      } catch {}
    }
    dragging = null;
  }

  resizer.addEventListener('mousedown', onResizeMouseDown, true);

  function setStore(next) {
    store = next || { panels: [], last: {} };
    renderIcons();
    const selected = store.last?.selectedPanelId;
    if (selected) {
      setActivePanel(selected);
    } else {
      clearPanelBox();
    }
  }

  function setVisible(visible) {
    if (visible) root.removeAttribute('hidden');
    else root.setAttribute('hidden', 'true');
  }

  function setPosition(position) {
    root.setAttribute('position', position);
  }

  function setAutohide(enabled) {
    root.setAttribute('autohide', enabled ? 'true' : 'false');
  }

  function destroy() {
    clearPanelBox();
    root.remove();
  }

  return {
    root,
    setStore,
    setVisible,
    setPosition,
    setAutohide,
    setCssWidth,
    destroy,
  };
}
