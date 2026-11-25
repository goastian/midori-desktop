/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ResourceMemoryAdmission } from 'resource:///modules/ResourceMemoryAdmission.sys.mjs';

export class ResourceNativeMemoryController {
  _intent = null;
  _revision = 0;
  _dirty = false;
  _running = null;
  _reading = null;
  _possiblyLimited = false;
  _backendReady = false;
  _state = 'off';
  _error = null;
  _acknowledgement = null;
  _retryRange = false;
  _readError = false;
  _confirmedBytes = 0;
  _nativeToken = 0;
  _lastAckToken = 0;
  requests = 0;

  constructor(prepareLoad, onChange) {
    this._onChange = onChange;
    this.admission = ResourceMemoryAdmission.forNativeBudget(async options => {
      await this.whenSettled();
      if (this._enabled()) await prepareLoad(options);
    });
  }

  get busy() {
    return this._running !== null || this._reading !== null;
  }

  get blocksLoads() {
    return this.busy || this._possiblyLimited;
  }

  get needsRefresh() {
    return this._enabled() || this._possiblyLimited;
  }

  getSnapshot() {
    return { state: this._state, error: this._error, busy: this.busy,
      possiblyLimited: this._possiblyLimited, backendReady: this._backendReady,
      accountingAvailable: this._lastAckToken === this._nativeToken &&
        this._acknowledgement?.backendReady === true && this._acknowledgement.nativeError === 0,
      acknowledgement: this._acknowledgement ? structuredClone(this._acknowledgement) : null,
      requests: this.requests };
  }

  configure(memory, experimental) {
    const intent = { enabled: memory.enabled && memory.strict, budgetBytes: memory.budgetBytes, experimental };
    if (this._intent && Object.keys(intent).every(key => intent[key] === this._intent[key])) return;
    this._intent = intent;
    this._revision++;
    this._dirty = true;
    this._retryRange = false;
    this._readError = false;
    this._error = null;
    this._state = this._enabled() || this._possiblyLimited ? 'checking' : 'off';
    this._launch();
    this.admission.recheck();
  }

  async whenSettled() {
    while (this.busy) await Promise.all([this._running, this._reading]);
    return this.getSnapshot();
  }

  refresh() {
    if (this.busy) return this.whenSettled();
    if (!this._enabled()) {
      if (this._possiblyLimited) {
        this._dirty = true;
        this._launch();
      }
      return this.whenSettled();
    }
    const revision = this._revision;
    const token = ++this._nativeToken;
    this._reading = Promise.resolve().then(async () => {
      try {
        this.requests++;
        const ack = await ChromeUtils.requestManagedMemoryUsage();
        if (!this._record(ack, token) || revision !== this._revision) return;
        if (!ack.backendReady || ack.nativeError) throw new Error(`memory-usage-not-confirmed:${ack.nativeError || 0}`);
        if (this._readError && ack.ownedLimit && this._confirmedBytes === this._intent.budgetBytes) {
          this._readError = false;
          this._error = null;
          this._state = 'limited';
        }
        if (this._retryRange && (!ack.hasLimit || ack.ownedLimit) && this._intent.budgetBytes >= ack.minimumBytes) {
          this._dirty = true;
          this._retryRange = false;
          this._error = null;
          this._state = 'checking';
          this._launch();
        } else if (!ack.ownedLimit) throw new Error('memory-limit-ownership-lost');
      } catch (error) {
        if (revision === this._revision) {
          this._error = String(error);
          this._readError = true;
          this._state = 'error';
        }
      }
    }).finally(() => {
      this._reading = null;
      this._notify();
    });
    return this.whenSettled();
  }

  _enabled() {
    return !!(this._intent?.enabled && this._intent.experimental);
  }

  _notify() {
    this.admission.configure(this.blocksLoads);
    try { this._onChange(); } catch (error) { console.error(error); }
  }

  _launch() {
    this._running ||= Promise.resolve().then(() => this._drain()).finally(() => {
      this._running = null;
      this._notify();
    });
    this._notify();
  }

  _record(ack, token) {
    if (token < this._lastAckToken) return false;
    this._lastAckToken = token;
    this._acknowledgement = structuredClone(ack);
    this._backendReady = ack.backendReady === true;
    if (ack.backendReady && !ack.nativeError) this._possiblyLimited = ack.ownedLimit === true;
    return true;
  }

  async _drain() {
    while (this._dirty) {
      this._dirty = false;
      const revision = this._revision;
      const bytes = this._enabled() ? this._intent.budgetBytes : 0;
      if (!bytes && !this._possiblyLimited) {
        this._state = 'off';
        continue;
      }
      const previous = this._possiblyLimited;
      const token = ++this._nativeToken;
      if (bytes) this._possiblyLimited = true;
      try {
        this.requests++;
        const ack = await ChromeUtils.requestManagedMemoryBudget(bytes);
        if (!this._record(ack, token)) continue;
        if (ack.backendReady) this._possiblyLimited = ack.ownedLimit === true;
        else if (!previous && !ack.applied && !ack.nativeError) this._possiblyLimited = false;
        if (!ack.backendReady && !ack.applied && !ack.nativeError) {
          if (revision === this._revision) this._state = this._enabled() ? 'pending' : this._possiblyLimited ? 'checking' : 'off';
          continue;
        }
        if (!ack.backendReady || !ack.applied || ack.nativeError || ack.requestedBytes !== bytes ||
            (bytes ? !ack.ownedLimit || !ack.hasLimit || !ack.hasEffectiveLimit ||
              ack.limitBytes <= 0 || ack.limitBytes > bytes || ack.effectiveLimitBytes <= 0 ||
              ack.effectiveLimitBytes > ack.limitBytes : ack.ownedLimit || ack.hasLimit)) {
          if (revision === this._revision) this._retryRange = bytes !== 0 && ack.nativeError === 34;
          throw new Error(`memory-budget-not-confirmed:${ack.nativeError || 0}`);
        }
        this._confirmedBytes = bytes;
        if (revision === this._revision) {
          this._error = null;
          this._retryRange = false;
          this._state = bytes ? 'limited' : 'off';
        }
      } catch (error) {
        if (revision === this._revision) {
          this._error = String(error);
          this._state = 'error';
        }
      }
    }
  }
}
