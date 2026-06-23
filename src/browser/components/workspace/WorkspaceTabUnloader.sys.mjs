/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Pure, side-effect-free decision logic for memory-aware workspace tab
 * unloading. When the user switches away from a workspace, its tabs stay in
 * memory even though they are hidden. Discarding (unloading) those tabs frees
 * their memory while keeping the tab entry, so switching back simply reloads
 * the page on demand.
 *
 * This module mirrors the guard contract used by TabSleepLifecycle so both
 * features agree on what is safe to discard. Keep it free of Services / gBrowser
 * usage so it can be unit-tested with node:test.
 */

const DEFAULT_UNLOAD_DELAY_MS = 45000;
const MIN_UNLOAD_DELAY_MS = 5000;
const MAX_UNLOAD_DELAY_MS = 1800000;

// about:, chrome:, file:, view-source:, blank and new-tab style internal pages
// are cheap to keep and may hold user state, so never discard them.
const INTERNAL_URI_RE =
  /^(about:|chrome:|resource:|file:|view-source:|moz-extension:|jar:)/i;

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(numeric, min), max);
}

export const WorkspaceTabUnloader = {
  DEFAULT_UNLOAD_DELAY_MS,

  getUnloadDelayMs(configured) {
    return clampNumber(
      configured,
      DEFAULT_UNLOAD_DELAY_MS,
      MIN_UNLOAD_DELAY_MS,
      MAX_UNLOAD_DELAY_MS
    );
  },

  isUriExcluded(uriSpec = '') {
    if (typeof uriSpec !== 'string' || uriSpec === '') {
      // An empty spec usually means the tab never finished loading a real
      // document; treat it as not safe to discard.
      return true;
    }
    return INTERNAL_URI_RE.test(uriSpec);
  },

  /**
   * Decide whether a single tab that belongs to an inactive workspace can be
   * safely discarded to reclaim memory.
   *
   * @param {object} state
   * @param {boolean} state.belongsToActiveWorkspace Tab is in the visible workspace.
   * @param {boolean} state.selected Tab is the currently selected tab.
   * @param {boolean} state.multiselected Tab is part of a multi-selection.
   * @param {boolean} state.pinned Tab is pinned (shared/essential).
   * @param {boolean} state.closing Tab is being closed.
   * @param {boolean} state.discarded Tab is already unloaded.
   * @param {boolean} state.busy Tab is currently loading.
   * @param {boolean} state.soundPlaying Tab is producing audio.
   * @param {boolean} state.attention Tab is requesting attention.
   * @param {boolean} state.hasLinkedPanel Tab has a live browser panel.
   * @param {boolean} state.autoDiscardable Tab opted out of auto discard when false.
   * @param {string}  state.uriSpec Current top-level URI of the tab.
   * @returns {boolean} True when the tab is safe to discard.
   */
  shouldUnloadTab({
    belongsToActiveWorkspace,
    selected,
    multiselected,
    pinned,
    closing,
    discarded,
    busy,
    soundPlaying,
    attention,
    hasLinkedPanel,
    autoDiscardable,
    uriSpec,
  }) {
    if (belongsToActiveWorkspace) {
      return false;
    }

    if (
      selected ||
      multiselected ||
      pinned ||
      closing ||
      discarded ||
      busy ||
      soundPlaying ||
      attention ||
      !hasLinkedPanel ||
      autoDiscardable === false
    ) {
      return false;
    }

    if (this.isUriExcluded(uriSpec)) {
      return false;
    }

    return true;
  },
};
