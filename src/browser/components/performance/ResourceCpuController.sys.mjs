/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class ResourceCpuController {
  _intent = null;
  _revision = 0;
  _dirty = false;
  _running = null;
  _removal = null;
  _removalToken = 0;
  _lastRemovalRevision = -1;
  _nativeToken = 0;
  _lastAckToken = 0;
  _lastNonzeroToken = 0;
  _lastNotifiedState = null;
  _possiblyLimited = false;
  _backendReady = false;
  _state = 'off';
  _error = null;
  _acknowledgement = null;
  requests = 0;

  constructor(onChange) {
    this._onChange = onChange;
  }

  get busy() {
    return this._running !== null || this._removal !== null;
  }

  get needsRefresh() {
    return this._possiblyLimited || this._state === 'limited';
  }

  getSnapshot() {
    return {
      state: this._state,
      available: !!this._intent?.experimental && this._backendReady,
      acknowledgement: this._acknowledgement ? structuredClone(this._acknowledgement) : null,
      error: this._error,
      busy: this.busy,
      needsRefresh: this.needsRefresh,
      requests: this.requests,
    };
  }

  configure(cpu, experimental) {
    const intent = { enabled: cpu.enabled, percent: cpu.percent, experimental };
    if (this._intent && Object.keys(intent).every(key => intent[key] === this._intent[key])) return;
    this._intent = intent;
    this._revision++;
    this._error = null;
    this._dirty = true;
    this._state = this._percentage() || this._possiblyLimited ? 'checking' : this._inactiveState();
    if (!this._percentage() && this._possiblyLimited) this._beginRemoval();
    this._launch();
    this._notify();
  }

  refresh() {
    if (this.busy || !this.needsRefresh) return;
    this._lastRemovalRevision = -1;
    this._dirty = true;
    this._launch();
  }

  async whenSettled() {
    while (this.busy) await Promise.all([this._running, this._removal]);
    return this.getSnapshot();
  }

  _percentage() {
    return this._intent.enabled && this._intent.experimental ? this._intent.percent : 0;
  }

  _inactiveState() {
    return this._intent.enabled ? 'pending' : 'off';
  }

  _notify() {
    const key = JSON.stringify([this._state, this._error, this._backendReady,
      this._intent?.experimental, this._acknowledgement]);
    const changed = key !== this._lastNotifiedState;
    this._lastNotifiedState = key;
    try { this._onChange(changed); } catch (error) { console.error(error); }
  }

  _launch() {
    this._running ||= Promise.resolve().then(() => this._drain()).finally(() => {
      this._running = null;
      this._notify();
    });
  }

  async _drain() {
    while (this._dirty) {
      this._dirty = false;
      const revision = this._revision;
      const percentage = this._error ? 0 : this._percentage();
      if (!percentage && !this._possiblyLimited) {
        if (!this._error) this._state = this._inactiveState();
        continue;
      }
      if (!percentage) {
        if (this._removal) await this._removal;
        else if (!this._error || this._lastRemovalRevision !== revision) await this._beginRemoval();
      } else {
        await this._request(percentage, revision);
        if (this._error && this._possiblyLimited && !this._dirty) await this._beginRemoval();
      }
    }
  }

  _beginRemoval() {
    if (this._removal && this._removalToken > this._lastNonzeroToken) return this._removal;
    this._lastRemovalRevision = this._revision;
    const request = this._request(0, this._revision);
    const removal = request.finally(() => {
      if (this._removal === removal) {
        this._removal = null;
        if (!this._running) this._notify();
      }
    });
    this._removal = removal;
    return removal;
  }

  async _request(percentage, revision) {
    const token = ++this._nativeToken;
    const previouslyLimited = this._possiblyLimited;
    if (percentage) {
      this._possiblyLimited = true;
      this._lastNonzeroToken = token;
    } else this._removalToken = token;
    try {
      this.requests++;
      const ack = await ChromeUtils.requestManagedCpuBudget(percentage);
      if (token < this._lastAckToken) return;
      this._lastAckToken = token;
      this._acknowledgement = structuredClone(ack);
      this._backendReady = ack.backendReady === true;
      if (!ack.backendReady && !ack.applied && !ack.nativeError &&
          (!previouslyLimited || !this._possiblyLimited)) {
        this._possiblyLimited = this._lastNonzeroToken > token;
        if (revision === this._revision) this._state = this._inactiveState();
        return;
      }
      if (!ack.backendReady || !ack.applied || ack.nativeError || ack.requestedPercentage !== percentage) {
        throw new Error(`cpu-budget-not-confirmed:${ack.nativeError || 0}`);
      }
      if (percentage && (!Number.isFinite(ack.externalCapacityCpus) || ack.externalCapacityCpus <= 0 ||
          !Number.isFinite(ack.ownQuotaCpus) || ack.ownQuotaCpus <= 0 ||
          !Number.isFinite(ack.effectiveCapacityCpus) || ack.effectiveCapacityCpus <= 0 ||
          Math.abs(ack.ownQuotaCpus - ack.externalCapacityCpus * percentage / 100) > .000011 ||
          Math.abs(ack.effectiveCapacityCpus - Math.min(ack.ownQuotaCpus, ack.externalCapacityCpus)) > .000011)) {
        throw new Error('cpu-capacity-not-confirmed');
      }
      if (!percentage && ack.ownQuotaCpus !== 0) throw new Error('cpu-removal-not-confirmed');
      this._possiblyLimited = percentage !== 0 || this._lastNonzeroToken > token;
      if (revision === this._revision) {
        if (!percentage && !this._percentage()) this._error = null;
        if (!this._error) this._state = percentage ? 'limited' : this._inactiveState();
      }
    } catch (error) {
      if (revision === this._revision && token >= this._lastAckToken) {
        this._lastAckToken = token;
        this._error = String(error);
        this._state = 'error';
      }
    }
  }
}
