/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const CONFIG_PREF = 'midori.performance.configuration';
export const CUSTOM_BASE_PREF = 'midori.performance.custom.baseProfile';
export const CUSTOM_PROFILE = 4;
export const GiB = 1024 ** 3;

export function defaultConfiguration() {
  return {
    version: 1,
    revision: 0,
    memory: { enabled: false, budgetBytes: 4 * GiB, strict: false },
    cpu: { enabled: false, percent: 50 },
    network: { enabled: false, downloadBps: 1000000, uploadBps: 1000000 },
  };
}

function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(name);
  }
  return value;
}

export function validateConfiguration(value) {
  if (!value || value.version !== 1) {
    throw new TypeError('configuration-version');
  }
  for (const key of ['memory', 'cpu', 'network']) {
    if (typeof value[key]?.enabled !== 'boolean') {
      throw new TypeError(`${key}-enabled`);
    }
  }
  if (typeof value.memory.strict !== 'boolean') {
    throw new TypeError('memory-strict');
  }
  return {
    version: 1,
    revision: integer(value.revision, 0, Number.MAX_SAFE_INTEGER - 1, 'revision'),
    memory: {
      enabled: value.memory.enabled,
      budgetBytes: integer(value.memory.budgetBytes, GiB / 2, 1024 * GiB, 'memory-budget'),
      strict: value.memory.strict,
    },
    cpu: {
      enabled: value.cpu.enabled,
      percent: integer(value.cpu.percent, 1, 100, 'cpu-percent'),
    },
    network: {
      enabled: value.network.enabled,
      downloadBps: integer(value.network.downloadBps, 1024, 2 ** 32 - 1, 'network-download'),
      uploadBps: integer(value.network.uploadBps, 1024, 2 ** 32 - 1, 'network-upload'),
    },
  };
}

export function parseConfiguration(raw) {
  if (!raw) return { configuration: defaultConfiguration(), error: null };
  try {
    return { configuration: validateConfiguration(JSON.parse(raw)), error: null };
  } catch (error) {
    return { configuration: defaultConfiguration(), error: String(error) };
  }
}
