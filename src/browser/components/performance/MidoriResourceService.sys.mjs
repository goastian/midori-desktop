/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CONFIG_PREF, CUSTOM_BASE_PREF, CUSTOM_PROFILE, parseConfiguration,
  validateConfiguration } from 'resource:///modules/MidoriResourcePolicy.sys.mjs';
import { ResourceSampler } from 'resource:///modules/ResourceSampler.sys.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AppConstants: 'resource://gre/modules/AppConstants.sys.mjs',
  MemoryProfileManager: 'resource:///modules/MemoryProfileManager.sys.mjs',
  MemoryProfilePolicy: 'resource:///modules/MemoryProfilePolicy.sys.mjs',
  ResourceCpuController: 'resource:///modules/ResourceCpuController.sys.mjs',
  ResourceMemoryController: 'resource:///modules/ResourceMemoryController.sys.mjs',
  ResourceTabCoordinator: 'resource:///modules/ResourceTabCoordinator.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
  clearTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

const PROFILE_PREF = 'midori.memory.profile';
const CPU_READY_PREF = 'midori.performance.cpu.experimental.enabled';
const NETWORK_READY_PREF = 'midori.performance.network.experimental.enabled';
const NETWORK_PREFS = ['midori.performance.network.experimental.downloadBps',
  'midori.performance.network.experimental.uploadBps'];
const MAX_NATIVE_RATE = 2 ** 31 - 1;

export const MidoriResourceService = {
  _initialized: false,
  _applying: false,
  _subscribers: new Set(),
  _sampler: new ResourceSampler(),
  _timer: null,
  _pending: null,
  _sample: null,
  _sampleError: null,
  _memoryState: 'off',
  _memoryController: null,
  _reclaimedTabs: 0,
  _cpuController: null,
  _networkKey: null,
  _networkUpdating: false,
  _networkToken: 0,
  _networkState: 'off',
  _networkAcknowledgement: null,
  _networkChecks: 0,
  _networkError: null,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    Services.prefs.addObserver(CONFIG_PREF, this);
    Services.prefs.addObserver(PROFILE_PREF, this);
    Services.prefs.addObserver(CUSTOM_BASE_PREF, this);
    Services.prefs.addObserver(CPU_READY_PREF, this);
    Services.prefs.addObserver(NETWORK_READY_PREF, this);
    for (const pref of NETWORK_PREFS) Services.prefs.addObserver(pref, this);
    try { this._syncNetwork(this.getConfiguration().network); }
    catch (error) { this._networkState = 'error'; this._networkError = String(error); }
    this._syncCpu(this.getConfiguration().cpu);
    this._schedule();
  },

  uninit() {
    const config = this.getConfiguration();
    if (this._subscribers.size || config.memory.enabled || config.cpu.enabled ||
        this._cpuController?.busy || this._cpuController?.needsRefresh ||
        (config.network.enabled && this.getCapabilities().network)) return;
    if (!this._initialized) return;
    this._initialized = false;
    for (const pref of [CONFIG_PREF, PROFILE_PREF, CUSTOM_BASE_PREF, CPU_READY_PREF, NETWORK_READY_PREF, ...NETWORK_PREFS]) {
      Services.prefs.removeObserver(pref, this);
    }
    this._stopTimer();
    this._sampler.reset();
    this._memoryController?.reset();
    this._sample = null;
  },

  getConfiguration() {
    return parseConfiguration(Services.prefs.getStringPref(CONFIG_PREF, '')).configuration;
  },

  getCapabilities() {
    return { memory: { flexible: true, strict: false },
      cpu: Services.prefs.getBoolPref(CPU_READY_PREF, false) && !!this._cpuController?.getSnapshot().available,
      network: Services.prefs.getBoolPref(NETWORK_READY_PREF, false) &&
        typeof ChromeUtils.requestManagedSocketUsage === 'function' };
  },

  getTabs(win, order = 'memory') {
    return lazy.ResourceTabCoordinator.describeTabs(win, this._sample, order);
  },

  async suspendTab(win, id) {
    const tab = lazy.ResourceTabCoordinator.findTab(win, id);
    return tab ? lazy.ResourceTabCoordinator.discardTab(tab) : false;
  },

  closeTab(win, id) {
    const tab = lazy.ResourceTabCoordinator.findTab(win, id);
    if (tab) win.gBrowser.removeTab(tab, { animate: true });
  },

  getSnapshot() {
    const parsed = parseConfiguration(Services.prefs.getStringPref(CONFIG_PREF, ''));
    const profile = Services.prefs.getIntPref(PROFILE_PREF, 0);
    const base = profile === CUSTOM_PROFILE ? Services.prefs.getIntPref(CUSTOM_BASE_PREF, 0) : profile;
    const cpu = this._cpuController?.getSnapshot();
    return {
      configuration: parsed.configuration,
      configurationError: parsed.error,
      profile,
      baseProfile: base,
      capabilities: this.getCapabilities(),
      enforcement: {
        memory: parsed.configuration.memory.enabled ? 'flexible' : 'off',
        cpu: cpu?.state ?? (parsed.configuration.cpu.enabled ? 'pending' : 'off'),
        network: this._getNetworkState(parsed.configuration.network),
      },
      networkAcknowledgement: this._networkAcknowledgement ? structuredClone(this._networkAcknowledgement) : null,
      networkError: this._networkError,
      cpuAcknowledgement: cpu?.acknowledgement ?? null,
      cpuError: cpu?.error ?? null,
      measurementKind: lazy.AppConstants.platform === 'win' ? 'commit' : 'process-memory',
      sample: this._sample ? structuredClone(this._sample) : null,
      sampleError: this._sampleError,
      memoryState: parsed.configuration.memory.enabled ? this._memoryState : 'off',
      reclaimedTabs: this._reclaimedTabs,
      restartPreferences: lazy.MemoryProfilePolicy.getPrefsNeedingRestart(base, lazy.AppConstants.platform),
      diagnostics: { cpuChecks: cpu?.requests ?? 0, cpuPending: cpu?.busy ?? false,
        networkChecks: this._networkChecks, samples: this._sampler.samples, subscribers: this._subscribers.size, timerActive: this._timer !== null },
    };
  },

  applyConfiguration(configuration, expectedRevision, { profile = CUSTOM_PROFILE, baseProfile = 0 } = {}) {
    if (this._applying) throw new Error('configuration-busy');
    if (Services.prefs.prefIsLocked(CONFIG_PREF)) throw new Error('configuration-locked');
    const next = validateConfiguration(configuration);
    const current = this.getConfiguration();
    if (current.revision !== expectedRevision) throw new Error('configuration-conflict');
    if (![0, 1, 2, 3, 4].includes(profile) || ![0, 1, 2, 3].includes(baseProfile)) throw new Error('invalid-profile');
    if (profile !== CUSTOM_PROFILE && (next.memory.enabled || next.memory.strict || next.cpu.enabled || next.network.enabled)) throw new Error('custom-profile-required');
    this.init();
    const before = {
      config: Services.prefs.getStringPref(CONFIG_PREF, ''),
      hasConfig: Services.prefs.prefHasUserValue(CONFIG_PREF),
      profile: Services.prefs.getIntPref(PROFILE_PREF, 0),
      base: Services.prefs.getIntPref(CUSTOM_BASE_PREF, 0),
    };
    next.revision = current.revision + 1;
    this._applying = true;
    let restoreNetwork;
    try {
      Services.prefs.setStringPref(CONFIG_PREF, JSON.stringify(next));
      restoreNetwork = this._syncNetwork(next.network);
      if (profile !== before.profile || baseProfile !== before.base) {
        lazy.MemoryProfileManager.setProfile(profile, baseProfile);
      }
    } catch (error) {
      if (before.hasConfig) Services.prefs.setStringPref(CONFIG_PREF, before.config);
      else Services.prefs.clearUserPref(CONFIG_PREF);
      restoreNetwork?.();
      throw error;
    } finally {
      this._applying = false;
    }
    this._syncCpu(next.cpu);
    const memoryChanged = current.memory.enabled !== next.memory.enabled ||
      current.memory.budgetBytes !== next.memory.budgetBytes;
    if (memoryChanged) {
      this._memoryController?.reset();
      this._memoryState = next.memory.enabled ? 'monitoring' : 'off';
    }
    this._publish();
    this._schedule();
    return this.getSnapshot();
  },

  subscribe(listener) {
    this.init();
    this._subscribers.add(listener);
    this._publish();
    this.sampleNow();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this._subscribers.delete(listener);
      this._schedule();
      this.uninit();
    };
  },

  observe(_subject, topic, pref) {
    if (topic !== 'nsPref:changed' || this._applying || this._networkUpdating) return;
    if (NETWORK_PREFS.includes(pref)) {
      if (!this.getCapabilities().network) return;
      ++this._networkToken;
      this._networkKey = null;
      this._networkAcknowledgement = null;
    }
    if (pref !== CPU_READY_PREF && pref !== NETWORK_READY_PREF && !NETWORK_PREFS.includes(pref)) this._memoryController?.reset();
    if ((pref === PROFILE_PREF || pref === CUSTOM_BASE_PREF) && !Services.prefs.prefIsLocked(CONFIG_PREF)) {
      const config = this.getConfiguration();
      if (Services.prefs.getIntPref(PROFILE_PREF, 0) !== CUSTOM_PROFILE) {
        for (const section of ['memory', 'cpu', 'network']) config[section].enabled = false;
        config.memory.strict = false;
      }
      config.revision++;
      Services.prefs.setStringPref(CONFIG_PREF, JSON.stringify(config));
      return;
    }
    try { this._syncNetwork(this.getConfiguration().network); }
    catch (error) { this._networkState = 'error'; this._networkError = String(error); }
    this._syncCpu(this.getConfiguration().cpu);
    this._publish();
    this._schedule();
  },

  _syncCpu(cpu) {
    const experimental = Services.prefs.getBoolPref(CPU_READY_PREF, false) &&
      typeof ChromeUtils.requestManagedCpuBudget === 'function';
    if (!this._cpuController && (!cpu.enabled || !experimental)) return;
    this._cpuController ||= new lazy.ResourceCpuController(changed => {
      if (changed) this._publish();
      this._schedule();
      this.uninit();
    });
    this._cpuController.configure(cpu, experimental);
  },

  _getNetworkState(network) {
    if (this.getCapabilities().network && this._networkState === 'error') return 'error';
    if (!network.enabled) return 'off';
    if (!this.getCapabilities().network) return 'pending';
    if (network.downloadBps > MAX_NATIVE_RATE || network.uploadBps > MAX_NATIVE_RATE) return 'pending-range';
    return this._networkState === 'off' ? 'checking' : this._networkState;
  },

  _restoreNetworkPrefs(before) {
    const updating = this._networkUpdating;
    this._networkUpdating = true;
    try {
      for (const pref of before) {
        if (pref.hasValue) {
          if (Services.prefs.getIntPref(pref.name, 0) !== pref.value) Services.prefs.setIntPref(pref.name, pref.value);
        } else if (Services.prefs.prefHasUserValue(pref.name)) Services.prefs.clearUserPref(pref.name);
      }
    } finally { this._networkUpdating = updating; }
  },

  _syncNetwork(network) {
    const available = this.getCapabilities().network;
    if (!available && this._networkKey === null) return null;
    const status = !network.enabled ? 'off' : !available ? 'pending' :
      network.downloadBps > MAX_NATIVE_RATE || network.uploadBps > MAX_NATIVE_RATE ? 'pending-range' : 'checking';
    const rates = status === 'checking' ? [network.downloadBps, network.uploadBps] : [0, 0];
    const key = JSON.stringify([status, ...rates]);
    if (this._networkKey === key && NETWORK_PREFS.every((name, index) =>
      Services.prefs.getIntPref(name, 0) === rates[index])) return null;
    const before = NETWORK_PREFS.map(name => ({ name, value: Services.prefs.getIntPref(name, 0),
      hasValue: Services.prefs.prefHasUserValue(name) }));
    if (before.some((pref, index) => pref.value !== rates[index] && Services.prefs.prefIsLocked(pref.name))) {
      throw new Error('network-preference-locked');
    }
    this._networkUpdating = true;
    try {
      for (const [index, pref] of before.entries()) {
        if (pref.value !== rates[index]) Services.prefs.setIntPref(pref.name, rates[index]);
      }
    } catch (error) { this._restoreNetworkPrefs(before); throw error; }
    finally { this._networkUpdating = false; }
    this._networkKey = key;
    const token = ++this._networkToken;
    this._networkState = status;
    this._networkError = null;
    this._networkAcknowledgement = null;
    if (status === 'checking') this._verifyNetwork(rates, token);
    return () => {
      ++this._networkToken;
      this._restoreNetworkPrefs(before);
      this._networkKey = null;
      this._syncNetwork(this.getConfiguration().network);
    };
  },

  async _verifyNetwork(rates, token) {
    let failure;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (token !== this._networkToken) return;
      this._networkChecks++;
      try {
        const processes = await ChromeUtils.requestProcInfo(false);
        if (token !== this._networkToken) return;
        const requests = [ChromeUtils.requestManagedSocketUsage(false)];
        if (processes.children.some(process => process.type === 'socket')) {
          requests.push(ChromeUtils.requestManagedSocketUsage(true));
        }
        const acknowledgements = await Promise.all(requests);
        if (token !== this._networkToken) return;
        if (!acknowledgements.every(row => row.budget.downloadBps === rates[0] && row.budget.uploadBps === rates[1])) {
          throw new Error('network-budget-not-applied');
        }
        this._networkAcknowledgement = acknowledgements;
        this._networkState = 'limited';
        this._networkError = null;
        this._publish();
        return;
      } catch (error) { failure = String(error); }
      if (attempt < 2) await new Promise(resolve => lazy.setTimeout(resolve, attempt ? 100 : 20));
    }
    if (token !== this._networkToken) return;
    this._networkState = 'error';
    this._networkError = failure;
    this._publish();
  },

  sampleNow() {
    this._pending ||= this._takeSample().finally(() => {
      this._pending = null;
      this._schedule();
    });
    return this._pending;
  },

  async _takeSample() {
    try {
      this._sample = await this._sampler.sample();
      this._sampleError = null;
      this._cpuController?.refresh();
      const config = this.getConfiguration();
      if (config.memory.enabled) {
        this._memoryController ||= new lazy.ResourceMemoryController(this._sampler);
        const recovery = await this._memoryController.recover({ ...config.memory, strict: false }, {
          sample: this._sample,
          onReclaim: () => {
            this._memoryState = 'reclaiming';
            this._publish();
          },
          canContinue: () => {
            const latest = this.getConfiguration();
            return latest.memory.enabled && latest.revision === config.revision;
          },
        });
        this._reclaimedTabs += recovery.reclaimedTabs;
        const latest = this.getConfiguration();
        this._memoryState = latest.revision === config.revision ? recovery.state :
          latest.memory.enabled ? 'monitoring' : 'off';
        this._sample = recovery.sample;
      } else {
        this._memoryState = 'off';
        this._memoryController?.reset();
      }
    } catch (error) {
      this._sampleError = String(error);
      this._memoryState = 'error';
    }
    this._publish();
    return this.getSnapshot();
  },

  _publish() {
    if (!this._subscribers.size) return;
    const snapshot = this.getSnapshot();
    for (const listener of this._subscribers) {
      try { listener(structuredClone(snapshot)); } catch (error) { console.error(error); }
    }
  },

  _stopTimer() {
    if (this._timer !== null) lazy.clearTimeout(this._timer);
    this._timer = null;
  },

  _schedule() {
    this._stopTimer();
    const enabled = this.getConfiguration().memory.enabled;
    const cpu = this._cpuController?.needsRefresh && !this._cpuController.busy;
    if ((!enabled && !cpu && !this._subscribers.size) || this._pending) return;
    this._timer = lazy.setTimeout(() => {
      this._timer = null;
      if (enabled || this._subscribers.size) this.sampleNow();
      else this._cpuController.refresh();
    }, this._subscribers.size ? 1000 : !cpu && this._memoryState === 'blocked' ? 10000 : 3000);
  },
};
