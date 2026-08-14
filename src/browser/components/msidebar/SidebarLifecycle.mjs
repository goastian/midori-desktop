const DEFAULT_IDLE_MINUTES = 15;
const MAX_IDLE_MINUTES = 24 * 60;

export function normalizePanelLifecycle(value, { unloadOnClose = false } = {}) {
  const mode = ['suspend', 'idle', 'keep-alive'].includes(value?.mode)
    ? value.mode
    : unloadOnClose
      ? 'suspend'
      : 'idle';
  const rawIdleMinutes = Number(value?.idleMinutes);
  const idleMinutes = Number.isFinite(rawIdleMinutes)
    ? Math.min(MAX_IDLE_MINUTES, Math.max(1, Math.round(rawIdleMinutes)))
    : DEFAULT_IDLE_MINUTES;
  return { mode, idleMinutes };
}

export function lifecyclePolicyForPanel(panel) {
  return normalizePanelLifecycle(panel?.lifecycle, panel || {});
}

export function lifecycleSuspendCandidates(panels, runtime = {}, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const activePanelId = options.activePanelId || '';
  const memoryBudget = Math.max(1, Number(options.memoryBudget) || 3);
  const resident = (Array.isArray(panels) ? panels : [])
    .filter(panel => panel?.id && runtime[panel.id]?.resident)
    .map(panel => ({ panel, runtime: runtime[panel.id] }));
  const candidates = [];

  for (const entry of resident) {
    if (entry.panel.id === activePanelId) continue;
    const policy = lifecyclePolicyForPanel(entry.panel);
    if (policy.mode === 'suspend') {
      candidates.push({ panelId: entry.panel.id, reason: 'policy' });
      continue;
    }
    if (policy.mode === 'idle') {
      const lastActiveAt = Number(entry.runtime.lastActiveAt) || 0;
      if (now - lastActiveAt >= policy.idleMinutes * 60_000) {
        candidates.push({ panelId: entry.panel.id, reason: 'idle' });
      }
    }
  }

  const remaining = resident
    .filter(entry => !candidates.some(candidate => candidate.panelId === entry.panel.id))
    .filter(entry => entry.panel.id !== activePanelId)
    .sort((a, b) => (Number(a.runtime.lastActiveAt) || 0) - (Number(b.runtime.lastActiveAt) || 0));
  const overBudget = Math.max(0, resident.length - candidates.length - memoryBudget);
  for (const entry of remaining.slice(0, overBudget)) {
    candidates.push({ panelId: entry.panel.id, reason: 'budget' });
  }
  return candidates;
}

export function updatePanelRuntime(runtime, panelId, update = {}, now = Date.now()) {
  const current = runtime?.[panelId] || {};
  return {
    ...(runtime || {}),
    [panelId]: {
      status: typeof update.status === 'string' ? update.status : current.status || 'unloaded',
      resident: update.resident === undefined ? !!current.resident : !!update.resident,
      loadedAt: Number(update.loadedAt) || Number(current.loadedAt) || 0,
      lastActiveAt: Number(update.lastActiveAt) || Number(current.lastActiveAt) || 0,
      suspendedAt: Number(update.suspendedAt) || Number(current.suspendedAt) || 0,
      permissions: Array.isArray(update.permissions) ? update.permissions.slice(0, 12) : Array.isArray(current.permissions) ? current.permissions.slice(0, 12) : [],
      updatedAt: now,
    },
  };
}
