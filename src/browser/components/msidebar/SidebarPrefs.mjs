export const PREF_ENABLED = 'midori.msidebar.enabled';
export const PREF_POSITION = 'midori.msidebar.position';
export const PREF_WIDTH = 'midori.msidebar.width';
export const PREF_AUTOHIDE_ENABLED = 'midori.msidebar.autohide.enabled';
export const PREF_AUTOHIDE_MODE = 'midori.msidebar.autohide.mode';
export const PREF_ANIMATIONS_ENABLED = 'midori.msidebar.animations.enabled';

export const POSITION_LEFT = 'left';
export const POSITION_RIGHT = 'right';

export const AUTOHIDE_MODE_OVERLAY = 'overlay';
export const AUTOHIDE_MODE_INLINE = 'inline';

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
