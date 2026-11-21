import { sanitizeUrl } from './SidebarModel.mjs';

export function openPanelEditor(panel, {
  win, opener, createXul, createHtml, containerOptions, setBoolAttr,
  normalizePanelShortcut, panelDisplayTitle, validatePanelEditInput,
  desktopReloadPanels, updatePanel, onPanelUpdated, onPopupChanged,
}) {
  const doc = win.document;
  const panelId = panel.id;
  doc.getElementById('midori-msidebar-edit-dialog-wrapper')?.remove?.();
  doc.getElementById('midori-msidebar-edit-dialog-backdrop')?.remove?.();
  const previousFocus = opener || doc.activeElement;

  // Use a vbox container that will act as a lightweight dialog
  const dlgWrapper = createXul(doc, 'vbox');
  dlgWrapper.id = 'midori-msidebar-edit-dialog-wrapper';
  dlgWrapper.classList.add('midori-msidebar-edit-dialog');
  dlgWrapper.setAttribute('role', 'dialog');
  dlgWrapper.setAttribute('aria-modal', 'true');

  // Add a semi-transparent backdrop
  const backdrop = createXul(doc, 'vbox');
  backdrop.id = 'midori-msidebar-edit-dialog-backdrop';
  backdrop.setAttribute('style', `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(8,10,18,0.46);
    z-index: 9999;
  `);
  doc.documentElement.appendChild(backdrop);

  // Title bar
  const titleBar = createXul(doc, 'hbox');
  titleBar.classList.add('midori-msidebar-edit-header');
  const titleWrap = createXul(doc, 'vbox');
  titleWrap.classList.add('midori-msidebar-edit-title-wrap');
  titleWrap.setAttribute('flex', '1');
  const titleLabel = createXul(doc, 'label');
  titleLabel.id = 'midori-msidebar-edit-dialog-title';
  titleLabel.classList.add('midori-msidebar-edit-title');
  titleLabel.setAttribute('value', 'Editar panel');
  const titleSubtitle = createXul(doc, 'label');
  titleSubtitle.classList.add('midori-msidebar-edit-subtitle');
  titleSubtitle.setAttribute('value', panelDisplayTitle(panel));
  titleSubtitle.setAttribute('crop', 'end');
  dlgWrapper.setAttribute('aria-labelledby', titleLabel.id);
  titleWrap.appendChild(titleLabel);
  titleWrap.appendChild(titleSubtitle);
  titleBar.appendChild(titleWrap);
  const btnCloseEditor = createXul(doc, 'toolbarbutton');
  btnCloseEditor.classList.add('toolbarbutton-1', 'midori-msidebar-edit-close');
  btnCloseEditor.setAttribute('aria-label', 'Cerrar editor');
  btnCloseEditor.setAttribute('tooltiptext', 'Cerrar editor');
  titleBar.appendChild(btnCloseEditor);
  dlgWrapper.appendChild(titleBar);

  // Scroll container for content
  const scrollBox = createXul(doc, 'scrollbox');
  scrollBox.classList.add('midori-msidebar-edit-scroll');
  dlgWrapper.appendChild(scrollBox);

  const dlg = createXul(doc, 'vbox');
  dlg.id = 'midori-msidebar-edit-panel';
  scrollBox.appendChild(dlg);

  const tabs = createXul(doc, 'vbox');
  tabs.classList.add('midori-msidebar-edit-tabs');
  const tabstrip = createXul(doc, 'hbox');
  tabstrip.id = 'midori-msidebar-edit-sections';
  tabstrip.setAttribute('role', 'tablist');
  tabs.appendChild(tabstrip);

  const tabpanels = createXul(doc, 'vbox');
  tabpanels.classList.add('midori-msidebar-edit-panels');
  tabs.appendChild(tabpanels);

  let editTabCounter = 0;
  function mkTab(label) {
    const index = editTabCounter++;
    const tab = createXul(doc, 'button');
    tab.setAttribute('label', label);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    tab.setAttribute('selected', index === 0 ? 'true' : 'false');
    tab.setAttribute('tabindex', index === 0 ? '0' : '-1');
    tabstrip.appendChild(tab);

    const panel = createXul(doc, 'vbox');
    panel.id = `midori-msidebar-edit-tabpanel-${panelId}-${index}`;
    panel.classList.add('midori-msidebar-edit-section');
    tab.setAttribute('aria-controls', panel.id);
    setBoolAttr(panel, 'hidden', index !== 0);
    tabpanels.appendChild(panel);

    const content = createXul(doc, 'vbox');
    content.classList.add('midori-msidebar-edit-content');
    panel.appendChild(content);
    const selectTab = () => {
      for (const [buttonIndex, button] of [...tabstrip.children].entries()) {
        const selected = buttonIndex === index;
        button.setAttribute('selected', selected ? 'true' : 'false');
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.setAttribute('tabindex', selected ? '0' : '-1');
        setBoolAttr(tabpanels.children[buttonIndex], 'hidden', !selected);
      }
      scrollBox.scrollTop = 0;
    };
    tab.addEventListener('click', selectTab, true);
    tab.addEventListener('command', selectTab, true);
    return content;
  }

  tabstrip.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const items = [...tabstrip.children];
    const current = Math.max(0, items.indexOf(doc.activeElement));
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    items[next]?.focus?.();
    items[next]?.click?.();
  }, true);

  // Helper: Create form row
  let editControlCounter = 0;
  function formRow(label, control) {
    const hbox = createXul(doc, 'hbox');
    hbox.classList.add('midori-msidebar-edit-form-row');
    const lbl = createXul(doc, 'label');
    lbl.classList.add('midori-msidebar-edit-form-label');
    lbl.setAttribute('value', label);
    if (!control.id) control.id = `midori-msidebar-edit-control-${editControlCounter++}`;
    control.classList.add('midori-msidebar-edit-control');
    lbl.setAttribute('control', control.id);
    hbox.appendChild(lbl);
    hbox.appendChild(control);
    return hbox;
  }

  function formColumn(label, control) {
    const box = createXul(doc, 'vbox');
    box.classList.add('midori-msidebar-edit-form-column');
    const lbl = createXul(doc, 'label');
    lbl.classList.add('midori-msidebar-edit-form-label');
    lbl.setAttribute('value', label);
    if (!control.id) control.id = `midori-msidebar-edit-control-${editControlCounter++}`;
    control.classList.add('midori-msidebar-edit-control');
    lbl.setAttribute('control', control.id);
    box.appendChild(lbl);
    box.appendChild(control);
    return box;
  }

  function editGroup(parent, title, help = '') {
    const group = createXul(doc, 'vbox');
    group.classList.add('midori-msidebar-edit-group');
    const heading = createXul(doc, 'label');
    heading.classList.add('midori-msidebar-edit-group-title');
    heading.setAttribute('value', title);
    group.appendChild(heading);
    if (help) {
      const description = createXul(doc, 'description');
      description.classList.add('midori-msidebar-edit-group-help');
      description.textContent = help;
      group.appendChild(description);
    }
    parent.appendChild(group);
    return group;
  }

  // TAB 1: General
  const pnGeneral = mkTab('General');
  {
    const generalHelp = createXul(doc, 'description');
    generalHelp.classList.add('midori-msidebar-edit-help');
    generalHelp.textContent = 'Cambia la dirección, el nombre y cómo se conserva este panel.';
    pnGeneral.appendChild(generalHelp);
    const pageGroup = editGroup(pnGeneral, 'Página');

    const txtUrl = createHtml(doc, 'input');
    txtUrl.type = 'url';
    txtUrl.value = panel.url || '';
    txtUrl.setAttribute('placeholder', 'https://ejemplo.com');
    pageGroup.appendChild(formRow('Dirección', txtUrl));

    const chkPinned = createXul(doc, 'checkbox');
    chkPinned.setAttribute('label', 'Mantener abierto — evita que se oculte automáticamente');
    chkPinned.setAttribute('checked', panel.pinned ? 'true' : 'false');

    const uaMenu = createXul(doc, 'menulist');
    uaMenu.setAttribute('style', 'min-width: 240px;');
    const uaPopup = createXul(doc, 'menupopup');
    for (const opt of [
      { label: 'Escritorio', value: 'desktop' },
      { label: 'Móvil', value: 'mobile' },
    ]) {
      const mi = createXul(doc, 'menuitem');
      mi.setAttribute('label', opt.label);
      mi.setAttribute('value', opt.value);
      uaPopup.appendChild(mi);
    }
    uaMenu.appendChild(uaPopup);
    uaMenu.value = panel.mobile ? 'mobile' : 'desktop';
    pageGroup.appendChild(formRow('Vista', uaMenu));

    const containerMenu = createXul(doc, 'menulist');
    containerMenu.setAttribute('style', 'min-width: 240px;');
    const containerPopup = createXul(doc, 'menupopup');
    for (const opt of containerOptions()) {
      const mi = createXul(doc, 'menuitem');
      mi.setAttribute('label', opt.label);
      mi.setAttribute('value', String(opt.id));
      if (opt.color) mi.style.setProperty('--midori-msidebar-container-color', opt.color);
      containerPopup.appendChild(mi);
    }
    containerMenu.appendChild(containerPopup);
    containerMenu.value = String(panel.userContextId || 0);
    pageGroup.appendChild(formRow('Contenedor', containerMenu));

    const lifetimeGroup = editGroup(
      pnGeneral,
      'Al cerrar la barra',
      'Elige si el panel permanece disponible y si conserva la página abierta.'
    );
    lifetimeGroup.classList.add('midori-msidebar-edit-options');
    lifetimeGroup.appendChild(chkPinned);

    const chkTemporary = createXul(doc, 'checkbox');
    chkTemporary.setAttribute('label', 'Temporal — se elimina al cerrar la ventana');
    chkTemporary.setAttribute('checked', panel.temporary ? 'true' : 'false');
    lifetimeGroup.appendChild(chkTemporary);

    const chkKeepAlive = createXul(doc, 'checkbox');
    chkKeepAlive.setAttribute('label', 'Conservar activo — mantiene la sesión al cerrar la barra');
    chkKeepAlive.setAttribute('checked', panel.unloadOnClose ? 'false' : 'true');
    lifetimeGroup.appendChild(chkKeepAlive);

    const chkRestoreLast = createXul(doc, 'checkbox');
    chkRestoreLast.setAttribute('label', 'Volver a la última página visitada');
    chkRestoreLast.setAttribute('checked', panel.restoreLastUrl ? 'true' : 'false');
    lifetimeGroup.appendChild(chkRestoreLast);

    const chkMuted = createXul(doc, 'checkbox');
    chkMuted.setAttribute('label', 'Silenciar audio');
    chkMuted.setAttribute('checked', panel.muted ? 'true' : 'false');
    lifetimeGroup.appendChild(chkMuted);

    const syncPanelLifetime = () => {
      if (chkTemporary.checked) chkPinned.checked = false;
      setBoolAttr(chkPinned, 'disabled', !!chkTemporary.checked);
    };
    chkTemporary.addEventListener('command', syncPanelLifetime, true);
    chkPinned.addEventListener('command', () => {
      if (chkPinned.checked) chkTemporary.checked = false;
      syncPanelLifetime();
    }, true);
    syncPanelLifetime();

    pnGeneral._controls = { txtUrl, chkPinned, uaMenu, containerMenu, chkTemporary, chkKeepAlive, chkRestoreLast, chkMuted };
  }

  const pnTitleFavicon = editGroup(
    pnGeneral,
    'Identidad',
    'Usa el título y el icono del sitio o reemplázalos para reconocer el panel más rápido.'
  );
  {
    const titleModeMenu = createXul(doc, 'menulist');
    const titleModePopup = createXul(doc, 'menupopup');
    for (const opt of [
      { label: 'Usar título de la página', value: 'dynamic' },
      { label: 'Nombre personalizado', value: 'static' },
    ]) {
      const mi = createXul(doc, 'menuitem');
      mi.setAttribute('label', opt.label);
      mi.setAttribute('value', opt.value);
      titleModePopup.appendChild(mi);
    }
    titleModeMenu.appendChild(titleModePopup);
    titleModeMenu.value = panel.title?.mode === 'static' ? 'static' : 'dynamic';
    pnTitleFavicon.appendChild(formRow('Nombre del panel', titleModeMenu));

    const txtTitle = createHtml(doc, 'input');
    txtTitle.type = 'text';
    txtTitle.value = panel.title?.value || '';
    txtTitle.setAttribute('placeholder', 'Escribe un nombre');
    const titleValueRow = formRow('Nombre personalizado', txtTitle);
    pnTitleFavicon.appendChild(titleValueRow);

    const favModeMenu = createXul(doc, 'menulist');
    const favModePopup = createXul(doc, 'menupopup');
    for (const opt of [
      { label: 'Usar icono de la página', value: 'dynamic' },
      { label: 'Icono personalizado', value: 'static' },
    ]) {
      const mi = createXul(doc, 'menuitem');
      mi.setAttribute('label', opt.label);
      mi.setAttribute('value', opt.value);
      favModePopup.appendChild(mi);
    }
    favModeMenu.appendChild(favModePopup);
    favModeMenu.value = panel.favicon?.mode === 'static' ? 'static' : 'dynamic';
    pnTitleFavicon.appendChild(formRow('Icono del panel', favModeMenu));

    const txtFavicon = createHtml(doc, 'input');
    txtFavicon.type = 'url';
    txtFavicon.value = panel.favicon?.value || '';
    txtFavicon.setAttribute('placeholder', 'https://ejemplo.com/icono.png');
    const faviconValueRow = formRow('URL del icono', txtFavicon);
    pnTitleFavicon.appendChild(faviconValueRow);

    pnTitleFavicon._controls = {
      txtTitle,
      titleModeMenu,
      titleValueRow,
      txtFavicon,
      favModeMenu,
      faviconValueRow,
    };
  }

  const pnPosition = mkTab('Comportamiento');
  {
    const behaviorHelp = createXul(doc, 'description');
    behaviorHelp.classList.add('midori-msidebar-edit-help');
    behaviorHelp.textContent = 'El panel se muestra acoplado a la barra. Activa el modo flotante sólo si quieres colocarlo encima de la página.';
    pnPosition.appendChild(behaviorHelp);
    const floatingGroup = editGroup(pnPosition, 'Panel flotante');

    const chkFloating = createXul(doc, 'checkbox');
    chkFloating.setAttribute('label', 'Usar como panel flotante');
    chkFloating.setAttribute('checked', panel.floating?.enabled ? 'true' : 'false');
    floatingGroup.appendChild(chkFloating);

    const floatingDetails = createXul(doc, 'vbox');
    floatingDetails.classList.add('midori-msidebar-edit-nested');
    floatingGroup.appendChild(floatingDetails);

    const chkAlwaysOnTop = createXul(doc, 'checkbox');
    chkAlwaysOnTop.setAttribute('label', 'Mantener visible sobre el contenido');
    chkAlwaysOnTop.setAttribute('checked', panel.floating?.alwaysOnTop ? 'true' : 'false');
    floatingDetails.appendChild(chkAlwaysOnTop);

    const anchorOptions = [
      { label: 'Superior izquierda', value: 'tl' },
      { label: 'Superior derecha', value: 'tr' },
      { label: 'Inferior izquierda', value: 'bl' },
      { label: 'Inferior derecha', value: 'br' },
      { label: 'Centro', value: 'center' },
    ];
    const anchorMenu = createXul(doc, 'menulist');
    anchorMenu.setAttribute('style', 'width: 100%;');
    const anchorPopup = createXul(doc, 'menupopup');
    for (const opt of anchorOptions) {
      const mi = createXul(doc, 'menuitem');
      mi.setAttribute('label', opt.label);
      mi.setAttribute('value', opt.value);
      anchorPopup.appendChild(mi);
    }
    anchorMenu.appendChild(anchorPopup);
    anchorMenu.value = panel.floating?.anchor || 'center';
    floatingDetails.appendChild(formRow('Posición', anchorMenu));

    const geometryButton = createXul(doc, 'button');
    geometryButton.setAttribute('label', 'Ajustar posición y tamaño');
    geometryButton.setAttribute('aria-expanded', 'false');
    floatingDetails.appendChild(geometryButton);
    const geometryBox = createXul(doc, 'vbox');
    geometryBox.setAttribute('hidden', 'true');
    geometryBox.classList.add('midori-msidebar-edit-geometry');
    floatingDetails.appendChild(geometryBox);

    const txtX = createHtml(doc, 'input');
    txtX.value = String(panel.floating?.x ?? 0);
    txtX.type = 'number';
    geometryBox.appendChild(formRow('Desplazamiento horizontal', txtX));

    const txtY = createHtml(doc, 'input');
    txtY.value = String(panel.floating?.y ?? 0);
    txtY.type = 'number';
    geometryBox.appendChild(formRow('Desplazamiento vertical', txtY));

    const txtW = createHtml(doc, 'input');
    txtW.value = String(panel.floating?.w ?? 480);
    txtW.type = 'number';
    geometryBox.appendChild(formRow('Ancho', txtW));

    const txtH = createHtml(doc, 'input');
    txtH.value = String(panel.floating?.h ?? 640);
    txtH.type = 'number';
    geometryBox.appendChild(formRow('Alto', txtH));

    geometryButton.addEventListener('click', () => {
      const expanded = geometryBox.getAttribute('hidden') === 'true';
      setBoolAttr(geometryBox, 'hidden', !expanded);
      geometryButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      geometryButton.setAttribute('label', expanded ? 'Ocultar posición y tamaño' : 'Ajustar posición y tamaño');
    }, true);

    const syncFloatingControls = () => {
      const enabled = !!chkFloating.checked;
      setBoolAttr(floatingDetails, 'hidden', !enabled);
    };
    chkFloating.addEventListener('command', syncFloatingControls, true);
    syncFloatingControls();

    pnPosition._controls = { chkFloating, chkAlwaysOnTop, anchorMenu, txtX, txtY, txtW, txtH };
  }

  const pnLoading = editGroup(
    pnPosition,
    'Actualización automática',
    'Úsala sólo si el sitio no actualiza su contenido por sí mismo.'
  );
  {
    const chkPeriodicReload = createXul(doc, 'checkbox');
    chkPeriodicReload.setAttribute('label', 'Recargar este panel automáticamente');
    chkPeriodicReload.setAttribute('checked', panel.periodicReload?.enabled ? 'true' : 'false');
    pnLoading.appendChild(chkPeriodicReload);

    const txtReloadSecs = createHtml(doc, 'input');
    txtReloadSecs.value = String(Math.max(30, panel.periodicReload?.seconds || 300));
    txtReloadSecs.type = 'number';
    txtReloadSecs.setAttribute('min', '30');
    const reloadRow = formRow('Cada cuántos segundos', txtReloadSecs);
    pnLoading.appendChild(reloadRow);

    const syncReloadControls = () => {
      setBoolAttr(reloadRow, 'hidden', !chkPeriodicReload.checked);
    };
    chkPeriodicReload.addEventListener('command', syncReloadControls, true);
    syncReloadControls();

    pnLoading._controls = { chkPeriodicReload, txtReloadSecs };
  }

  const pnShortcut = mkTab('Avanzado');
  {
    const advancedHelp = createXul(doc, 'description');
    advancedHelp.classList.add('midori-msidebar-edit-help');
    advancedHelp.textContent = 'Opciones para atajos y sitios que necesitan una vista personalizada. Puedes dejarlas sin cambiar.';
    pnShortcut.appendChild(advancedHelp);
    const shortcutGroup = editGroup(pnShortcut, 'Acceso rápido');

    const txtShortcut = createHtml(doc, 'input');
    txtShortcut.type = 'text';
    txtShortcut.value = panel.shortcut || '';
    txtShortcut.setAttribute('placeholder', 'Por ejemplo: Ctrl+Mayús+E');
    shortcutGroup.appendChild(formRow('Atajo de teclado', txtShortcut));

    pnShortcut._controls = { txtShortcut };
  }

  const pnCSS = editGroup(
    pnShortcut,
    'Contenido del sitio',
    'Limita el panel a una zona concreta sólo cuando el sitio lo necesite.'
  );
  {
    const chkCssEnabled = createXul(doc, 'checkbox');
    chkCssEnabled.setAttribute('label', 'Elegir contenido mediante un selector CSS');
    chkCssEnabled.setAttribute('checked', panel.cssSelector?.enabled ? 'true' : 'false');
    pnCSS.appendChild(chkCssEnabled);

    const txtCss = createHtml(doc, 'textarea');
    txtCss.value = panel.cssSelector?.value || '';
    txtCss.setAttribute('rows', '5');
    txtCss.setAttribute('style', 'font-family:monospace;resize:vertical;min-height:104px;');
    const cssRow = formColumn('Selector CSS', txtCss);
    const cssHelp = createXul(doc, 'description');
    cssHelp.classList.add('midori-msidebar-edit-help');
    cssHelp.textContent = 'Sólo para usuarios que conocen la estructura CSS del sitio. Un selector incorrecto puede ocultar todo el contenido.';
    cssRow.insertBefore(cssHelp, txtCss);
    pnCSS.appendChild(cssRow);

    pnCSS._controls = { chkCssEnabled, txtCss, cssRow };
  }

  const pnHide = editGroup(
    pnShortcut,
    'Controles visibles',
    'Oculta únicamente los elementos que no necesitas en este panel.'
  );
  pnHide.classList.add('midori-msidebar-edit-options');
  {
    const chkHideToolbar = createXul(doc, 'checkbox');
    chkHideToolbar.setAttribute('label', 'Ocultar controles del panel');
    chkHideToolbar.setAttribute('checked', panel.hide?.toolbar ? 'true' : 'false');
    pnHide.appendChild(chkHideToolbar);

    const chkHideSoundIcon = createXul(doc, 'checkbox');
    chkHideSoundIcon.setAttribute('label', 'Ocultar indicador de sonido');
    chkHideSoundIcon.setAttribute('checked', panel.hide?.soundIcon ? 'true' : 'false');
    pnHide.appendChild(chkHideSoundIcon);

    const chkHideNotifBadge = createXul(doc, 'checkbox');
    chkHideNotifBadge.setAttribute('label', 'Ocultar contador de notificaciones');
    chkHideNotifBadge.setAttribute('checked', panel.hide?.notificationBadge ? 'true' : 'false');
    pnHide.appendChild(chkHideNotifBadge);

    pnHide._controls = { chkHideToolbar, chkHideSoundIcon, chkHideNotifBadge };
  }

  function syncEditorValidation() {
    const tf = pnTitleFavicon._controls;
    const general = pnGeneral._controls;
    const sc = pnShortcut._controls;
    const cs = pnCSS._controls;
    const values = {
      url: general.txtUrl.value,
      shortcut: sc.txtShortcut.value,
      cssSelector: cs.chkCssEnabled.checked ? cs.txtCss.value : '',
    };
    const validity = validatePanelEditInput(values);
    const invalidUrl = !validity.url;
    const invalidShortcut = !validity.shortcut;
    const invalidSelector = !validity.cssSelector;
    general.txtUrl.setAttribute('invalid', invalidUrl ? 'true' : 'false');
    sc.txtShortcut.setAttribute('invalid', invalidShortcut ? 'true' : 'false');
    cs.txtCss.setAttribute('invalid', invalidSelector ? 'true' : 'false');
    try {
      setBoolAttr(cs.cssRow, 'hidden', !cs.chkCssEnabled.checked);
      setBoolAttr(tf.titleValueRow, 'hidden', tf.titleModeMenu.value !== 'static');
      setBoolAttr(tf.faviconValueRow, 'hidden', tf.favModeMenu.value !== 'static');
      btnOK.disabled = invalidUrl || invalidShortcut || invalidSelector;
    } catch {}
  }

  for (const control of [
    pnGeneral._controls.txtUrl,
    pnTitleFavicon._controls.titleModeMenu,
    pnTitleFavicon._controls.favModeMenu,
    pnShortcut._controls.txtShortcut,
    pnCSS._controls.chkCssEnabled,
    pnCSS._controls.txtCss,
  ]) {
    try {
      control.addEventListener('command', syncEditorValidation, true);
      control.addEventListener('input', syncEditorValidation, true);
    } catch {}
  }

  // Dialog buttons
  const btnOK = createXul(doc, 'button');
  btnOK.setAttribute('label', 'Guardar');
  btnOK.setAttribute('data-primary', 'true');

  const btnCancel = createXul(doc, 'button');
  btnCancel.setAttribute('label', 'Cancelar');

  dlg.appendChild(tabs);
  const buttonBox = createXul(doc, 'hbox');
  buttonBox.classList.add('midori-msidebar-edit-footer');
  buttonBox.appendChild(btnCancel);
  buttonBox.appendChild(btnOK);
  dlgWrapper.appendChild(buttonBox);

  btnOK.addEventListener('command', () => {
    updatePanel(panelId, (p) => {
      const g = pnGeneral._controls;
      p.url = sanitizeUrl(g.txtUrl.value) || p.url;
      p.pinned = g.chkPinned.checked && !g.chkTemporary.checked;
      p.mobile = g.uaMenu.value === 'mobile';
      p.userContextId = parseInt(g.containerMenu.value, 10) || 0;
      if (!p.mobile) {
        desktopReloadPanels.delete(panelId);
      }
      p.temporary = g.chkTemporary.checked;
      p.unloadOnClose = !g.chkKeepAlive.checked;
      p.lifecycle = {
        mode: g.chkKeepAlive.checked ? 'keep-alive' : 'idle',
        idleMinutes: p.lifecycle?.idleMinutes || 15,
      };
      p.restoreLastUrl = g.chkRestoreLast.checked;
      p.muted = g.chkMuted.checked;

      const tf = pnTitleFavicon._controls;
      p.title = {
        mode: tf.titleModeMenu.value === 'static' ? 'static' : 'dynamic',
        value: tf.txtTitle.value,
      };
      p.favicon = {
        mode: tf.favModeMenu.value === 'static' ? 'static' : 'dynamic',
        value: tf.txtFavicon.value,
      };

      const pos = pnPosition._controls;
      p.floating = {
        enabled: pos.chkFloating.checked,
        anchor: pos.anchorMenu.value || 'center',
        alwaysOnTop: pos.chkAlwaysOnTop.checked,
        x: parseInt(pos.txtX.value) || 0,
        y: parseInt(pos.txtY.value) || 0,
        w: parseInt(pos.txtW.value) || 480,
        h: parseInt(pos.txtH.value) || 640,
      };

      const ld = pnLoading._controls;
      p.periodicReload = {
        enabled: ld.chkPeriodicReload.checked,
        seconds: Math.max(30, parseInt(ld.txtReloadSecs.value) || 300),
      };

      const sc = pnShortcut._controls;
      p.shortcut = normalizePanelShortcut(sc.txtShortcut.value);

      const cs = pnCSS._controls;
      p.cssSelector = {
        enabled: cs.chkCssEnabled.checked,
        value: cs.txtCss.value,
      };

      const hd = pnHide._controls;
      p.hide = {
        toolbar: hd.chkHideToolbar.checked,
        soundIcon: hd.chkHideSoundIcon.checked,
        notificationBadge: hd.chkHideNotifBadge.checked,
      };

      return p;
    });

    onPanelUpdated(panelId);

    closeEditor({ force: true });
  }, true);

  btnCancel.addEventListener('command', () => {
    closeEditor();
  }, true);
  btnCloseEditor.addEventListener('command', () => {
    closeEditor();
  }, true);

  doc.documentElement.appendChild(dlgWrapper);
  onPopupChanged(true);
  let editorDirty = false;
  dlgWrapper.addEventListener('input', () => { editorDirty = true; }, true);
  dlgWrapper.addEventListener('command', (event) => {
    if (
      event.target !== btnCancel &&
      event.target !== btnOK &&
      event.target !== btnCloseEditor &&
      !tabstrip.contains(event.target)
    ) {
      editorDirty = true;
    }
  }, true);
  function closeEditor({ force = false } = {}) {
    if (!force && editorDirty) {
      const confirm = Services.prompt.confirm(win, 'Descartar cambios', 'Hay cambios sin guardar. ¿Quieres cerrar?');
      if (!confirm) return false;
    }
    dlgWrapper.removeEventListener('keydown', onEditorKeyDown, true);
    backdrop.remove();
    dlgWrapper.remove();
    onPopupChanged(false);
    try {
      previousFocus?.focus?.();
    } catch {}
    return true;
  }
  function onEditorKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeEditor();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dlgWrapper.querySelectorAll('button,input,textarea,checkbox,menulist,[tabindex="0"]')]
      .filter((node) => !node.disabled && node.getAttribute('hidden') !== 'true');
    if (!focusable.length) return;
    if (event.shiftKey && doc.activeElement === focusable[0]) {
      event.preventDefault();
      focusable.at(-1).focus();
    } else if (!event.shiftKey && doc.activeElement === focusable.at(-1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  }
  dlgWrapper.addEventListener('keydown', onEditorKeyDown, true);
  syncEditorValidation();
  // Focus the first input for better UX
  try {
    const firstInput = dlgWrapper.querySelector('input, textarea, checkbox, menulist');
    if (firstInput) firstInput.focus();
  } catch {}
}
