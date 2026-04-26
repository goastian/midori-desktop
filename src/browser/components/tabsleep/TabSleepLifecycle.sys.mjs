/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_TIMEOUT_MINUTES = 10;
const MIN_TIMEOUT_MINUTES = 1;
const MAX_TIMEOUT_MINUTES = 24 * 60;

const MIN_SCHEDULE_DELAY_MS = 1000;
const MAX_SCHEDULE_DELAY_MS = 30000;

const INTERNAL_URI_RE = /^(about|chrome|resource|moz-extension|view-source):/i;

function clampNumber(value, fallback, min, max) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export const TabSleepLifecycle = {
  DEFAULT_TIMEOUT_MINUTES,

  getTimeoutMinutes(configured) {
    return clampNumber(
      configured,
      DEFAULT_TIMEOUT_MINUTES,
      MIN_TIMEOUT_MINUTES,
      MAX_TIMEOUT_MINUTES
    );
  },

  getTimeoutMs(configured) {
    return this.getTimeoutMinutes(configured) * 60 * 1000;
  },

  normalizeHosts(value) {
    if (typeof value !== 'string') {
      return [];
    }

    return value
      .split(',')
      .map(normalizeText)
      .filter(Boolean);
  },

  isHostExcluded(host, excludedHosts = []) {
    const normalizedHost = normalizeText(host);
    if (!normalizedHost) {
      return false;
    }

    return excludedHosts.includes(normalizedHost);
  },

  isUriExcluded(uriSpec = '') {
    return INTERNAL_URI_RE.test(uriSpec);
  },

  getTabDeadlineMs({ lastActivityAt, lastAccessedAt, timeoutMs }) {
    const activityTs = Math.max(
      Number.isFinite(lastActivityAt) ? lastActivityAt : 0,
      Number.isFinite(lastAccessedAt) ? lastAccessedAt : 0
    );

    if (!activityTs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return null;
    }

    return activityTs + timeoutMs;
  },

  shouldDiscardTab({
    now,
    timeoutMs,
    lastActivityAt,
    lastAccessedAt,
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
    host,
    excludedHosts = [],
  }) {
    if (!Number.isFinite(now)) {
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

    if (this.isUriExcluded(uriSpec) || this.isHostExcluded(host, excludedHosts)) {
      return false;
    }

    const deadlineMs = this.getTabDeadlineMs({
      lastActivityAt,
      lastAccessedAt,
      timeoutMs,
    });
    if (!deadlineMs) {
      return false;
    }

    return now >= deadlineMs;
  },

  getNextEvaluationDelayMs({ now, timeoutMs, candidates = [] }) {
    let nextDeadlineMs = null;

    for (const candidate of candidates) {
      const deadlineMs = this.getTabDeadlineMs({
        lastActivityAt: candidate?.lastActivityAt,
        lastAccessedAt: candidate?.lastAccessedAt,
        timeoutMs,
      });
      if (!deadlineMs) {
        continue;
      }

      if (nextDeadlineMs === null || deadlineMs < nextDeadlineMs) {
        nextDeadlineMs = deadlineMs;
      }
    }

    if (nextDeadlineMs === null) {
      return MAX_SCHEDULE_DELAY_MS;
    }

    return clampNumber(
      nextDeadlineMs - now,
      MIN_SCHEDULE_DELAY_MS,
      MIN_SCHEDULE_DELAY_MS,
      MAX_SCHEDULE_DELAY_MS
    );
  },
};