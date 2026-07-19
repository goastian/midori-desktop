/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class MidoriServiceLifecycle {
  constructor(services, { onError = null } = {}) {
    this._services = [...services];
    this._onError = onError;
    this._activeServices = [];
    this._initialized = false;
  }

  init() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;
    for (const descriptor of this._services) {
      try {
        const service = descriptor.getService();
        this._activeServices.push({ name: descriptor.name, service });
        service.init();
      } catch (error) {
        this._reportError('init', descriptor.name, error);
      }
    }
  }

  uninit() {
    if (!this._initialized && !this._activeServices.length) {
      return;
    }

    this._initialized = false;
    const activeServices = this._activeServices.splice(0).reverse();
    for (const { name, service } of activeServices) {
      try {
        service.uninit();
      } catch (error) {
        this._reportError('uninit', name, error);
      }
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
