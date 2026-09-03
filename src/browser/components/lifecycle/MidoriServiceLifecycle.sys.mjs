/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const MIDORI_SERVICE_STATES = Object.freeze({
  UNUSED: 'unused',
  CONFIGURED: 'configured',
  ACTIVE: 'active',
});

export class MidoriServiceLifecycle {
  constructor(
    services,
    {
      onError = null,
      preferenceSource = null,
      preferenceDomain = 'midori.',
      scheduleRefresh = callback => callback(),
    } = {}
  ) {
    this._services = services.map(descriptor => ({
      descriptor,
      service: null,
      state: MIDORI_SERVICE_STATES.UNUSED,
      started: false,
    }));
    this._onError = onError;
    this._preferenceSource = preferenceSource;
    this._preferenceDomain = preferenceDomain;
    this._scheduleRefresh = scheduleRefresh;
    this._initialized = false;
    this._observingPreferences = false;
    this._refreshScheduled = false;
  }

  init() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;
    if (this._preferenceSource) {
      this._preferenceSource.addObserver(this._preferenceDomain, this);
      this._observingPreferences = true;
    }
    this.refresh();
  }

  uninit() {
    if (!this._initialized && !this._services.some(record => record.started)) {
      return;
    }

    this._initialized = false;
    this._refreshScheduled = false;
    if (this._observingPreferences) {
      try {
        this._preferenceSource.removeObserver(this._preferenceDomain, this);
      } catch {}
      this._observingPreferences = false;
    }
    for (const record of [...this._services].reverse()) {
      this._stop(record);
      record.state = MIDORI_SERVICE_STATES.UNUSED;
    }
  }

  observe(_subject, topic) {
    if (topic !== 'nsPref:changed' || !this._initialized) {
      return;
    }
    if (this._refreshScheduled) {
      return;
    }
    this._refreshScheduled = true;
    this._scheduleRefresh(() => {
      this._refreshScheduled = false;
      this.refresh();
    });
  }

  refresh() {
    if (!this._initialized) {
      return;
    }
    for (const record of this._services) {
      this._reconcile(record);
    }
  }

  getSnapshot() {
    return this._services.map(({ descriptor, service, state, started }) => ({
      name: descriptor.name,
      state,
      loaded: !!service,
      started,
    }));
  }

  _reconcile(record) {
    const { descriptor } = record;
    let state = MIDORI_SERVICE_STATES.ACTIVE;
    try {
      state = descriptor.getState?.() || MIDORI_SERVICE_STATES.ACTIVE;
      if (!Object.values(MIDORI_SERVICE_STATES).includes(state)) {
        throw new Error(`Invalid service state: ${state}`);
      }
    } catch (error) {
      this._reportError('state', descriptor.name, error);
      state = MIDORI_SERVICE_STATES.UNUSED;
    }

    record.state = state;
    if (state === MIDORI_SERVICE_STATES.ACTIVE) {
      this._start(record);
    } else {
      this._stop(record);
    }
  }

  _start(record) {
    if (record.started) {
      return;
    }
    const { descriptor } = record;
    try {
      record.service ||= descriptor.getService();
      record.started = true;
      record.service.init();
    } catch (error) {
      this._reportError('init', descriptor.name, error);
    }
  }

  _stop(record) {
    if (!record.started) {
      return;
    }
    record.started = false;
    try {
      record.service.uninit();
    } catch (error) {
      this._reportError('uninit', record.descriptor.name, error);
    }
  }

  _reportError(phase, name, error) {
    if (this._onError) {
      this._onError({ phase, name, error });
      return;
    }

    console.error(`Midori: Failed to ${phase} ${name}`, error);
  }
}
