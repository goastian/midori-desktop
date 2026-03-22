export const PREF_ENABLED = 'midori.msidebar.enabled';
export const PREF_POSITION = 'midori.msidebar.position';
export const PREF_WIDTH = 'midori.msidebar.width';
export const PREF_AUTOHIDE_ENABLED = 'midori.msidebar.autohide.enabled';
export const PREF_AUTOHIDE_MODE = 'midori.msidebar.autohide.mode';
export const PREF_ANIMATIONS_ENABLED = 'midori.msidebar.animations.enabled';
export const PREF_DEBUG = 'midori.msidebar.debug';
export const PREF_HIDE_PANEL_WHEN_HIDDEN = 'midori.msidebar.hidePanelWhenHidden';
export const PREF_NEW_PANEL_BUTTON_POSITION = 'midori.msidebar.newPanelButton.position';
export const PREF_GEOMETRY_HINT = 'midori.msidebar.geometryHint.enabled';
export const PREF_CONTAINER_INDICATOR = 'midori.msidebar.containerIndicator';
export const PREF_TOOLTIP_MODE = 'midori.msidebar.tooltip.mode';
export const PREF_TOOLTIP_FULL_URL = 'midori.msidebar.tooltip.fullUrl';
export const PREF_WEBPANEL_TOOLBAR_AUTOHIDE = 'midori.msidebar.webPanelToolbar.autohide';
export const PREF_WEBPANEL_TOOLBAR_AUTOHIDE_BACK = 'midori.msidebar.webPanelToolbar.autohideBack';
export const PREF_WEBPANEL_TOOLBAR_AUTOHIDE_FORWARD = 'midori.msidebar.webPanelToolbar.autohideForward';
export const PREF_SHORTCUT_TOGGLE_SIDEBAR = 'midori.msidebar.shortcut.toggleSidebar';
export const PREF_SHORTCUT_TOGGLE_PANEL = 'midori.msidebar.shortcut.togglePanel';

export const POSITION_LEFT = 'left';
export const POSITION_RIGHT = 'right';

export const AUTOHIDE_MODE_OVERLAY = 'overlay';
export const AUTOHIDE_MODE_INLINE = 'inline';

export const NEW_PANEL_BUTTON_BEFORE = 'before';
export const NEW_PANEL_BUTTON_AFTER = 'after';

export const CONTAINER_INDICATOR_OFF = 'off';
export const CONTAINER_INDICATOR_LEFT = 'left';
export const CONTAINER_INDICATOR_RIGHT = 'right';
export const CONTAINER_INDICATOR_TOP = 'top';
export const CONTAINER_INDICATOR_BOTTOM = 'bottom';
export const CONTAINER_INDICATOR_AROUND = 'around';

export const TOOLTIP_OFF = 'off';
export const TOOLTIP_TITLE = 'title';
export const TOOLTIP_URL = 'url';
export const TOOLTIP_TITLE_URL = 'title-url';

export function getEnabled() {
  return Services.prefs.getBoolPref(PREF_ENABLED, false);
}

export function getPosition() {
  const pos = Services.prefs.getStringPref(PREF_POSITION, POSITION_LEFT);
  return pos === POSITION_RIGHT ? POSITION_RIGHT : POSITION_LEFT;
}

export function getWidth() {
  const width = Services.prefs.getIntPref(PREF_WIDTH, 320);
  return Math.min(800, Math.max(200, width));
}

export function setWidth(width) {
  Services.prefs.setIntPref(PREF_WIDTH, Math.min(800, Math.max(200, width)));
}

export function getAutohideEnabled() {
  return Services.prefs.getBoolPref(PREF_AUTOHIDE_ENABLED, false);
}

export function getAutohideMode() {
  const mode = Services.prefs.getStringPref(PREF_AUTOHIDE_MODE, AUTOHIDE_MODE_OVERLAY);
  return mode === AUTOHIDE_MODE_INLINE ? AUTOHIDE_MODE_INLINE : AUTOHIDE_MODE_OVERLAY;
}

export function getAnimationsEnabled() {
  return Services.prefs.getBoolPref(PREF_ANIMATIONS_ENABLED, true);
}

export function getDebugEnabled() {
  return Services.prefs.getBoolPref(PREF_DEBUG, false);
}

export function getHidePanelWhenHidden() {
  return Services.prefs.getBoolPref(PREF_HIDE_PANEL_WHEN_HIDDEN, true);
}

export function getNewPanelButtonPosition() {
  const v = Services.prefs.getStringPref(PREF_NEW_PANEL_BUTTON_POSITION, NEW_PANEL_BUTTON_BEFORE);
  return v === NEW_PANEL_BUTTON_AFTER ? NEW_PANEL_BUTTON_AFTER : NEW_PANEL_BUTTON_BEFORE;
}

export function getGeometryHintEnabled() {
  return Services.prefs.getBoolPref(PREF_GEOMETRY_HINT, true);
}

export function getContainerIndicator() {
  const v = Services.prefs.getStringPref(PREF_CONTAINER_INDICATOR, CONTAINER_INDICATOR_LEFT);
  if (
    v === CONTAINER_INDICATOR_OFF ||
    v === CONTAINER_INDICATOR_RIGHT ||
    v === CONTAINER_INDICATOR_TOP ||
    v === CONTAINER_INDICATOR_BOTTOM ||
    v === CONTAINER_INDICATOR_AROUND
  ) {
    return v;
  }
  return CONTAINER_INDICATOR_LEFT;
}

export function getTooltipMode() {
  const v = Services.prefs.getStringPref(PREF_TOOLTIP_MODE, TOOLTIP_TITLE_URL);
  if (v === TOOLTIP_OFF || v === TOOLTIP_TITLE || v === TOOLTIP_URL) return v;
  return TOOLTIP_TITLE_URL;
}

export function getTooltipFullUrl() {
  return Services.prefs.getBoolPref(PREF_TOOLTIP_FULL_URL, false);
}

export function getWebPanelToolbarAutohide() {
  return Services.prefs.getBoolPref(PREF_WEBPANEL_TOOLBAR_AUTOHIDE, true);
}

export function getWebPanelToolbarAutohideBack() {
  return Services.prefs.getBoolPref(PREF_WEBPANEL_TOOLBAR_AUTOHIDE_BACK, true);
}

export function getWebPanelToolbarAutohideForward() {
  return Services.prefs.getBoolPref(PREF_WEBPANEL_TOOLBAR_AUTOHIDE_FORWARD, true);
}

export function getShortcutToggleSidebar() {
  return Services.prefs.getStringPref(PREF_SHORTCUT_TOGGLE_SIDEBAR, '');
}

export function getShortcutTogglePanel() {
  return Services.prefs.getStringPref(PREF_SHORTCUT_TOGGLE_PANEL, '');
}
