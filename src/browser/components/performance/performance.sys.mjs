/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MidoriResourceService: service } = ChromeUtils.importESModule('resource:///modules/MidoriResourceService.sys.mjs');
const { GiB } = ChromeUtils.importESModule('resource:///modules/MidoriResourcePolicy.sys.mjs');
const $ = id => document.getElementById(id);
let snapshot;
let renderedSettings = null;
let latestSample = null;
const pending = new Map();
const pendingOriginal = new Map();
let committing = false;
const invalid = new Set();
let saveTimer = null;
let unsubscribe = null;
let hostVisible = true;
const browserWindow = window.browsingContext.topChromeWindow;
const tabRows = new Map();
const processRows = new Map();
const budgetFields = [
  { id: 'memory-budget', slider: 'memory-slider', section: 'memory', key: 'budgetBytes', multiplier: GiB },
  { id: 'cpu-budget', slider: 'cpu-slider', section: 'cpu', key: 'percent', multiplier: 1 },
  { id: 'network-download', section: 'network', key: 'downloadBps', multiplier: 125000 },
  { id: 'network-upload', section: 'network', key: 'uploadBps', multiplier: 125000 },
];
let capabilities;
const networkPresetValues = new Set(Array.from($('network-preset').options, option => option.value));

function setText(element, value) {
  if (element.textContent === value) return;
  const text = element.firstChild;
  if (value && text?.nodeType === Node.TEXT_NODE && !text.nextSibling) {
    text.nodeValue = value;
  } else {
    element.textContent = value;
  }
}

function renderTabs() {
  const rows = service.getTabs(browserWindow, $('tab-order').value);
  const ids = new Set(rows.map(tab => tab.id));
  for (const [id, entry] of tabRows) {
    if (ids.has(id)) continue;
    if (entry.row.contains(document.activeElement)) $('tab-order').focus();
    entry.row.remove();
    tabRows.delete(id);
  }
  const empty = $('tab-empty');
  if (empty.hidden !== !!rows.length) empty.hidden = !!rows.length;
  for (const [index, tab] of rows.entries()) {
    let entry = tabRows.get(tab.id);
    if (!entry) {
      const row = document.createElement('div');
      row.className = 'resource-tab';
      row.dataset.tabId = tab.id;
      const name = document.createElement('span');
      const metric = document.createElement('span');
      const shared = document.createElement('small');
      document.l10n.setAttributes(shared, 'midori-performance-tab-shared');
      const suspend = document.createElement('button');
      document.l10n.setAttributes(suspend, 'midori-performance-tab-suspend');
      const close = document.createElement('button');
      document.l10n.setAttributes(close, 'midori-performance-tab-close');
      entry = { row, name, metric, shared, suspend, suspending: false };
      suspend.addEventListener('click', async () => {
        entry.suspending = true;
        suspend.disabled = true;
        try { status(await service.suspendTab(browserWindow, tab.id) ? 'tab-suspended' : 'tab-protected'); }
        catch { status('tab-protected'); }
        finally { entry.suspending = false; renderTabs(); }
      });
      close.addEventListener('click', () => service.closeTab(browserWindow, tab.id));
      row.append(name, metric, shared, suspend, close);
      tabRows.set(tab.id, entry);
    }
    setText(entry.name, tab.title);
    setText(entry.metric, $('tab-order').value === 'cpu'
      ? tab.cpuPercent === null ? '—' : `${tab.cpuPercent.toFixed(1)} %`
      : tab.memoryBytes === null ? '—' : `${(tab.memoryBytes / 1024 ** 2).toFixed(0)} MiB`);
    const sharedHidden = !tab.shared;
    if (entry.shared.hidden !== sharedHidden) entry.shared.hidden = sharedHidden;
    const disabled = !tab.canSuspend || entry.suspending;
    if (entry.suspend.disabled !== disabled) entry.suspend.disabled = disabled;
    const position = $('tab-list').children[index];
    if (position !== entry.row) {
      const focused = entry.row.contains(document.activeElement) ? document.activeElement : null;
      $('tab-list').insertBefore(entry.row, position || null);
      focused?.focus({ preventScroll: true });
    }
  }
}

function renderProcesses(sample) {
  const list = $('process-list');
  const processes = $('process-details').open
    ? [...(sample?.processes || [])].sort((a, b) => b.memoryBytes - a.memoryBytes).slice(0, 8) : [];
  const pids = new Set(processes.map(process => process.pid));
  for (const [pid, entry] of processRows) {
    if (pids.has(pid)) continue;
    entry.row.remove();
    processRows.delete(pid);
  }
  for (const [index, process] of processes.entries()) {
    let entry = processRows.get(process.pid);
    if (!entry) {
      const row = document.createElement('div');
      row.className = 'resource-process';
      const name = document.createElement('span');
      const value = document.createElement('span');
      row.append(name, value);
      entry = { row, name, value };
      processRows.set(process.pid, entry);
    }
    setText(entry.name, `${process.type} · ${process.pid}`);
    setText(entry.value, `${(process.memoryBytes / 1024 ** 2).toFixed(0)} MiB`);
    const position = list.children[index];
    if (position !== entry.row) list.insertBefore(entry.row, position || null);
  }
}

function status(id) {
  document.l10n.setAttributes($('resource-status'), `midori-performance-${id}`);
}

function reset(state) {
  snapshot = state;
  renderedSettings = JSON.stringify([state.profile, state.baseProfile, state.configuration, state.capabilities, state.enforcement]);
  capabilities = state.capabilities;
  const value = path => pending.has(path) ? pending.get(path) :
    path.includes('.') ? state.configuration[path.split('.')[0]][path.split('.')[1]] : state[path];
  $('profile').value = String(value('profile'));
  $('base-profile').value = String(value('baseProfile'));
  for (const section of ['memory', 'cpu', 'network']) {
    $(`${section}-enabled`).checked = value(`${section}.enabled`);
  }
  $('memory-strict').checked = value('memory.strict');
  for (const field of budgetFields) {
    if (invalid.has(field.id)) continue;
    const amount = value(`${field.section}.${field.key}`) / field.multiplier;
    if ($(field.id).value !== String(amount)) $(field.id).value = amount;
    if (field.id === 'memory-budget') $('memory-slider').max = Math.max(64, amount);
    if (field.slider) $(field.slider).value = amount;
  }
  const download = value('network.downloadBps');
  const preset = String(download);
  $('network-preset').value = download === value('network.uploadBps') && networkPresetValues.has(preset) ? preset : 'custom';
  updateControls();
}

function updateControls() {
  const custom = $('profile').value === '4';
  $('custom-base-row').hidden = !custom;
  for (const [id, available, requested] of [
    ['memory-strict', capabilities.memory.strict, $('memory-enabled').checked && $('memory-strict').checked],
    ['cpu', capabilities.cpu, $('cpu-enabled').checked],
    ['network', capabilities.network, $('network-enabled').checked],
  ]) {
    $(`${id}-unavailable`).hidden = available || !requested;
  }
  const cpuState = snapshot.enforcement.cpu;
  const cpuNotice = $('cpu-unavailable');
  cpuNotice.hidden = cpuState === 'off' || cpuState === 'limited';
  document.l10n.setAttributes(cpuNotice, ['checking', 'error'].includes(cpuState)
    ? `midori-performance-enforcement-${cpuState}` : 'midori-performance-cpu-unavailable');
  const networkState = snapshot.enforcement.network;
  const networkNotice = $('network-unavailable');
  networkNotice.hidden = networkState === 'off' || networkState === 'limited';
  const networkMessage = ['checking', 'pending-range', 'error'].includes(networkState)
    ? `midori-performance-network-${networkState}` : 'midori-performance-network-unavailable';
  document.l10n.setAttributes(networkNotice, networkMessage);
  for (const section of ['memory', 'cpu', 'network']) {
    const active = snapshot.enforcement[section];
    const badge = $(`${section}-enforcement`);
    badge.dataset.state = active;
    document.l10n.setAttributes(badge, `midori-performance-enforcement-${active}`);
  }
  const base = custom ? $('base-profile').value : $('profile').value;
  document.l10n.setAttributes($('profile-description'), `midori-performance-description-${base}`);
}

function settingValue(state, path) {
  if (!path.includes('.')) return state[path];
  const [section, key] = path.split('.');
  return state.configuration[section][key];
}

function queue(path, value) {
  if (!pending.has(path)) pendingOriginal.set(path, settingValue(snapshot, path));
  pending.set(path, value);
}

function useCustomProfile() {
  if ($('profile').value !== '4') {
    queue('baseProfile', Number($('profile').value));
    queue('profile', 4);
    $('base-profile').value = $('profile').value;
    $('profile').value = '4';
  }
}

function save() {
  window.clearTimeout(saveTimer);
  saveTimer = null;
  if (!pending.size) return;
  const current = service.getSnapshot();
  const next = structuredClone(current.configuration);
  let profile = current.profile;
  let baseProfile = current.baseProfile;
  let changed = false;
  for (const [path, value] of pending) {
    if (path === 'profile') { changed ||= profile !== value; profile = value; }
    else if (path === 'baseProfile') { changed ||= baseProfile !== value; baseProfile = value; }
    else {
      const [section, key] = path.split('.');
      changed ||= next[section][key] !== value;
      next[section][key] = value;
    }
  }
  committing = true;
  try {
    const state = changed ? service.applyConfiguration(next, current.configuration.revision, { profile, baseProfile }) : current;
    pending.clear();
    pendingOriginal.clear();
    reset(state);
    status(invalid.size ? 'invalid-value' : state.restartPreferences.length ? 'applied-restart' : 'applied');
  } catch {
    status('apply-error');
  } finally { committing = false; }
}

function edit(event) {
  const id = event.target.id;
  const field = budgetFields.find(item => item.id === id || item.slider === id);
  if (field) {
    const input = $(field.id);
    if (field.slider === id) input.value = event.target.value;
    if (!input.value || !input.validity.valid) {
      invalid.add(field.id);
      input.setAttribute('aria-invalid', 'true');
      pending.delete(`${field.section}.${field.key}`);
      pendingOriginal.delete(`${field.section}.${field.key}`);
      status('invalid-value');
      return;
    }
    invalid.delete(field.id);
    input.removeAttribute('aria-invalid');
    useCustomProfile();
    queue(`${field.section}.${field.key}`, Math.round(Number(input.value) * field.multiplier));
    if (field.id === 'memory-budget') $('memory-slider').max = Math.max(64, Number(input.value));
    if (field.slider) $(field.slider).value = input.value;
  } else if (id === 'network-preset') {
    if (event.target.value === 'custom') { $('network-download').focus(); return; }
    const rate = Number(event.target.value);
    if (!Number.isSafeInteger(rate) || rate <= 0 || !networkPresetValues.has(event.target.value)) return;
    useCustomProfile();
    for (const direction of ['download', 'upload']) {
      const field = `network-${direction}`;
      invalid.delete(field);
      $(field).removeAttribute('aria-invalid');
      queue(`network.${direction}Bps`, rate);
    }
  } else if (id === 'profile') {
    const profile = Number(event.target.value);
    queue('profile', profile);
    if (profile !== 4) {
      queue('baseProfile', profile);
      for (const section of ['memory', 'cpu', 'network']) queue(`${section}.enabled`, false);
      queue('memory.strict', false);
    }
  } else if (id === 'base-profile') {
    queue('baseProfile', Number(event.target.value));
  } else if (id.endsWith('-enabled') || id === 'memory-strict') {
    useCustomProfile();
    const section = id.split('-')[0];
    queue(`${section}.${id === 'memory-strict' ? 'strict' : 'enabled'}`, event.target.checked);
    if (id === 'memory-strict' && event.target.checked) queue('memory.enabled', true);
    if (id === 'memory-enabled' && !event.target.checked) queue('memory.strict', false);
  } else return;
  reset(snapshot);
  if (field && event.type === 'input') {
    status('saving');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 180);
  } else save();
}

function render(state) {
  if (!committing && pending.size) {
    let replaced = false;
    const profileChanged = state.profile !== snapshot.profile &&
      state.profile !== (pending.get('profile') ?? snapshot.profile);
    if (profileChanged) {
      for (const id of invalid) $(id).removeAttribute('aria-invalid');
      invalid.clear();
    }
    for (const [path, original] of pendingOriginal) {
      if (profileChanged || settingValue(state, path) !== original) {
        pending.delete(path);
        pendingOriginal.delete(path);
        replaced = true;
      }
    }
    if (replaced) status('conflict');
  }
  if (renderedSettings !== JSON.stringify([state.profile, state.baseProfile, state.configuration, state.capabilities, state.enforcement])) reset(state);
  else snapshot = state;
  const sample = state.sample;
  latestSample = sample;
  setText($('memory-used'), sample ? `${(sample.memoryBytes / GiB).toFixed(2)} GiB` : '—');
  setText($('cpu-used'), sample?.cpuPercent === null || !sample ? '—' : `${sample.cpuPercent.toFixed(1)} %`);
  if (sample?.cpuCapacitySource?.startsWith('parent-') && Number.isFinite(sample.cpuCapacity)) {
    const explanation = sample.cpuCapacitySource === 'parent-affinity-visible-cgroup'
      ? 'midori-performance-cpu-quota-explanation' : 'midori-performance-cpu-available-explanation';
    document.l10n.setAttributes($('cpu-explanation'), explanation, { capacity: sample.cpuCapacity });
  } else {
    document.l10n.setAttributes($('cpu-explanation'), 'midori-performance-cpu-explanation');
  }
  const pressure = sample ? Math.round(Math.min(1, sample.memoryBytes / state.configuration.memory.budgetBytes) * 1000) / 1000 : 0;
  if ($('memory-pressure').value !== pressure) $('memory-pressure').value = pressure;
  document.l10n.setAttributes($('memory-kind'), `midori-performance-measurement-${state.measurementKind}`);
  document.l10n.setAttributes($('memory-state'), `midori-performance-state-${state.memoryState}`);
  renderProcesses(sample);
  renderTabs();
  if (state.sampleError || state.configurationError) status('measurement-error');
}

function connect() {
  if (!hostVisible || document.visibilityState === 'hidden' || unsubscribe) return;
  unsubscribe = service.subscribe(render);
}

function disconnect() {
  unsubscribe?.();
  unsubscribe = null;
}

$('resource-form').addEventListener('input', edit);
$('resource-form').addEventListener('change', edit);
$('resource-form').addEventListener('submit', event => { event.preventDefault(); save(); });
$('tab-order').addEventListener('change', renderTabs);
$('process-details').addEventListener('toggle', () => renderProcesses(latestSample));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); disconnect(); }
  else connect();
});
document.addEventListener('MidoriPerformanceVisibility', event => {
  hostVisible = event.detail === true;
  if (hostVisible) connect();
  else { save(); disconnect(); }
});
window.addEventListener('pagehide', () => { save(); disconnect(); });
window.addEventListener('pageshow', connect);
connect();

$('open-center').hidden = !window.location.search.includes('sidebar');
