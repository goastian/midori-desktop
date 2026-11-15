/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class ResourceSampler {
  _previous = new Map();
  _previousAt = null;
  _pending = null;
  _previousCpuCapacity = null;
  samples = 0;

  sample() {
    this._pending ||= this._sample().finally(() => { this._pending = null; });
    return this._pending;
  }

  reset() {
    this._previous.clear();
    this._previousAt = null;
    this._previousCpuCapacity = null;
  }

  async _sample() {
    const cpuInfo = await Promise.resolve().then(() => Services.sysinfo.processInfo).catch(() => null);
    const info = await ChromeUtils.requestProcInfo(false);
    const cpuCount = Number.isInteger(cpuInfo?.count) && cpuInfo.count > 0 ? cpuInfo.count : null;
    const nativeCapacity = Number.isFinite(cpuInfo?.cpuCapacity) && cpuInfo.cpuCapacity > 0;
    const managedQuota = cpuInfo?.cpuManagedQuota === true;
    const externalCapacity = managedQuota && cpuInfo.cpuExternalCapacityError === 0 &&
      Number.isFinite(cpuInfo.cpuExternalCapacity) && cpuInfo.cpuExternalCapacity > 0;
    const cpuCapacity = managedQuota ? externalCapacity ? cpuInfo.cpuExternalCapacity : null :
      nativeCapacity ? cpuInfo.cpuCapacity : cpuCount;
    const cpuCapacitySource = managedQuota
      ? externalCapacity ? 'parent-affinity-external-cgroup' : 'managed-external-capacity-unavailable'
      : nativeCapacity
      ? cpuInfo.cpuQuotaSampled && cpuInfo.cpuQuotaCpus > 0 ? 'parent-affinity-visible-cgroup' : 'parent-affinity'
      : 'reported-logical-cpus';
    const now = Services.telemetry.msSinceProcessStart();
    const elapsed = this._previousAt === null ? 0 : now - this._previousAt;
    const comparable = elapsed > 0 && cpuCapacity && cpuCapacity === this._previousCpuCapacity;
    const processes = [];
    const seen = new Set();
    const previous = new Map();
    let memoryBytes = 0;
    let deltaCpuNs = 0;
    for (const process of [info, ...(info.children || [])]) {
      if (!process.pid || seen.has(process.pid)) continue;
      seen.add(process.pid);
      const identity = `${process.pid}:${process.childID || 0}:${process.type}`;
      const cpuTime = Number(process.cpuTime);
      const memory = Number(process.memory);
      if (!Number.isFinite(cpuTime) || !Number.isFinite(memory) || cpuTime < 0 || memory < 0) {
        throw new Error('invalid-process-measurement');
      }
      const last = this._previous.get(identity);
      const delta = last === undefined || cpuTime < last ? null : cpuTime - last;
      previous.set(identity, cpuTime);
      memoryBytes += memory;
      if (delta !== null) deltaCpuNs += delta;
      processes.push({
        pid: process.pid,
        type: process.type,
        memoryBytes: memory,
        cpuPercent: comparable && delta !== null ? delta / (elapsed * 10000 * cpuCapacity) : null,
      });
    }
    this._previous = previous;
    this._previousAt = now;
    this._previousCpuCapacity = cpuCapacity;
    this.samples++;
    return {
      sampledAt: Date.now(),
      memoryBytes,
      cpuPercent: comparable ? deltaCpuNs / (elapsed * 10000 * cpuCapacity) : null,
      cpuCount,
      cpuCapacity,
      cpuCapacitySource,
      cpuCapacityDetails: nativeCapacity || managedQuota ? {
        affinityCpus: cpuInfo.cpuAffinityCpus,
        quotaCpus: cpuInfo.cpuQuotaCpus,
        quotaSampled: cpuInfo.cpuQuotaSampled,
        managedQuota,
        effectiveCapacityCpus: nativeCapacity ? cpuInfo.cpuCapacity : null,
        externalCapacityCpus: externalCapacity ? cpuInfo.cpuExternalCapacity : null,
        externalCapacityError: managedQuota ? cpuInfo.cpuExternalCapacityError : null,
      } : null,
      processes,
    };
  }
}
