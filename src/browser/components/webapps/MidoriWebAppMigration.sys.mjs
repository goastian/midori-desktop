/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ShellService: "moz-src:///browser/components/shell/ShellService.sys.mjs",
});

export const LEGACY_SSB_MIGRATION_PREF =
  "midori.webapps.legacySsbMigrationVersion";
export const LEGACY_SSB_MIGRATION_VERSION = 3;

const MAX_STORE_BYTES = 32 * 1024 * 1024;
const MAX_STORE_ENTRIES = 1000;
const MIGRATION_STATE_VERSION = 1;
const MIGRATION_STATE_FILENAME = "midori-taskbartab-migration.json";
const MAX_MIGRATION_STATE_BYTES = 2 * 1024 * 1024;
const MAX_MIGRATION_STATE_ENTRIES = 2000;
const MAX_URL_LENGTH = 8192;
const MAX_NAME_LENGTH = 80;
const MAX_LEGACY_ICONS = 8;
const MAX_LEGACY_ICON_DATA_LENGTH = 1024 * 1024;
const MAX_LEGACY_ICON_DATA_TOTAL = 2 * 1024 * 1024;
const MAX_FILENAME_COMPONENT_LENGTH = 255;
const MAX_CONCURRENT_MIGRATIONS = 4;
const SUPPORTED_PLATFORMS = new Set(["win", "linux"]);
const utf8Encoder = new TextEncoder();
let migrationState = null;
let migrationStateQueue = Promise.resolve();
const legacyMigrationReservations = new Map();
const pendingTaskbarRetirements = new Map();

function newResult() {
  return {
    migrationVersion: LEGACY_SSB_MIGRATION_VERSION,
    status: "pending",
    completed: false,
    total: 0,
    processed: 0,
    created: 0,
    deduplicated: 0,
    tombstoned: 0,
    invalid: 0,
    failed: 0,
  };
}

function finish(result, status, completed = false) {
  return Object.freeze({ ...result, status, completed });
}

function getCompletedVersion() {
  try {
    return Services.prefs.getIntPref(LEGACY_SSB_MIGRATION_PREF, 0);
  } catch {
    return 0;
  }
}

function markCompleted(result, status) {
  try {
    Services.prefs.setIntPref(
      LEGACY_SSB_MIGRATION_PREF,
      LEGACY_SSB_MIGRATION_VERSION
    );
    return finish(result, status, true);
  } catch (error) {
    console.warn(
      "MidoriWebApps: Could not record the legacy SSB migration version.",
      error
    );
    return finish(result, "preference-error");
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseURL(value, baseURI = null) {
  if (typeof value !== "string") {
    return null;
  }

  const spec = value.trim();
  if (!spec || spec.length > MAX_URL_LENGTH) {
    return null;
  }

  try {
    const uri = Services.io.newURI(spec, null, baseURI);
    return uri instanceof Ci.nsIURL ? uri : null;
  } catch {
    return null;
  }
}

function isInstallableURI(uri) {
  if (uri.userPass) {
    return false;
  }
  if (uri.scheme === "https") {
    return true;
  }
  return (
    uri.scheme === "http" &&
    ["localhost", "127.0.0.1", "::1"].includes(uri.host)
  );
}

function parseInstallableURL(value, baseURI = null) {
  const uri = parseURL(value, baseURI);
  return uri && isInstallableURI(uri) ? uri : null;
}

function getStartURI(key, entry) {
  const startURI = parseInstallableURL(entry.startURI);
  if (startURI) {
    return startURI;
  }

  const baseURI = parseURL(entry.startURI) ?? parseURL(key);
  const manifestStartURI = parseInstallableURL(
    entry.manifest?.start_url,
    baseURI
  );
  if (manifestStartURI) {
    return manifestStartURI;
  }

  return parseInstallableURL(key);
}

function normalizeName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const name = value
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name ? Array.from(name).slice(0, MAX_NAME_LENGTH).join("") : null;
}

function normalizeLegacyId(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_{}-]{1,128}$/.test(value)
  ) {
    return null;
  }
  return value;
}

function normalizeLegacyFileName(value, legacyId) {
  if (
    typeof value !== "string" ||
    !value ||
    !normalizeLegacyId(legacyId) ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
  ) {
    return null;
  }

  if (AppConstants.platform === "win") {
    if (
      /[<>:"\\|?*]/u.test(value) ||
      /[. ]$/u.test(value) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value) ||
      `${value}.lnk`.length > MAX_FILENAME_COMPONENT_LENGTH
    ) {
      return null;
    }
    return value;
  }

  if (AppConstants.platform === "linux") {
    const fileNames = [
      `midori-${value}-${legacyId}.desktop`,
      `${value}.png`,
    ];
    if (
      fileNames.some(
        fileName =>
          utf8Encoder.encode(fileName).length > MAX_FILENAME_COMPONENT_LENGTH
      )
    ) {
      return null;
    }
    return value;
  }

  return null;
}

function normalizeTaskbarTabId(value) {
  if (typeof value !== "string" || !value || value.length > 256) {
    return null;
  }
  return /[\p{Cc}\p{Cf}]/u.test(value) ? null : value;
}

function getName(entry) {
  const candidates = [
    entry.name,
    entry.config?.name,
    entry.manifest?.name,
    entry.manifest?.short_name,
  ];
  for (const candidate of candidates) {
    const name = normalizeName(candidate);
    if (name) {
      return name;
    }
  }
  return null;
}

function getScope(entry, startURI) {
  const candidates = [entry.manifest?.scope, entry.scope];
  for (const candidate of candidates) {
    const scopeURI = parseURL(candidate, startURI);
    if (
      scopeURI?.prePath === startURI.prePath &&
      startURI.filePath.startsWith(scopeURI.filePath)
    ) {
      return `${scopeURI.prePath}${scopeURI.filePath}`;
    }
  }
  return null;
}

function getLegacyIcons(entry) {
  if (!Array.isArray(entry.manifest?.icons)) {
    return [];
  }

  const icons = [];
  let totalLength = 0;
  for (const rawIcon of entry.manifest.icons) {
    if (!isObject(rawIcon) || typeof rawIcon.src !== "string") {
      continue;
    }
    const commaIndex = rawIcon.src.indexOf(",");
    if (
      !rawIcon.src.toLowerCase().startsWith("data:") ||
      commaIndex < 6 ||
      rawIcon.src.length > MAX_LEGACY_ICON_DATA_LENGTH ||
      totalLength + rawIcon.src.length > MAX_LEGACY_ICON_DATA_TOTAL
    ) {
      continue;
    }

    const mimeType = rawIcon.src
      .slice(5, commaIndex)
      .split(";", 1)[0]
      .toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/.test(mimeType)) {
      continue;
    }

    const icon = { src: rawIcon.src, type: mimeType };
    if (Array.isArray(rawIcon.sizes)) {
      const sizes = rawIcon.sizes
        .filter(
          size =>
            typeof size === "string" &&
            /^(?:any|[1-9]\d{0,3}x[1-9]\d{0,3})$/.test(size)
        )
        .slice(0, 8);
      if (sizes.length) {
        icon.sizes = sizes;
      }
    }
    if (Array.isArray(rawIcon.purpose)) {
      const purpose = rawIcon.purpose.filter(value =>
        ["any", "maskable", "monochrome"].includes(value)
      );
      if (purpose.length) {
        icon.purpose = Array.from(new Set(purpose));
      }
    }

    icons.push(icon);
    totalLength += rawIcon.src.length;
    if (icons.length >= MAX_LEGACY_ICONS) {
      break;
    }
  }
  return icons;
}

function buildManifest(entry, startURI) {
  const manifest = { start_url: startURI.spec };
  const name = getName(entry);
  const scope = getScope(entry, startURI);
  if (name) {
    manifest.name = name;
  }
  if (scope) {
    manifest.scope = scope;
  }
  const icons = getLegacyIcons(entry);
  if (icons.length) {
    manifest.icons = icons;
  }
  return manifest;
}

function getLegacyApp(key, entry) {
  if (!isObject(entry)) {
    return null;
  }

  const legacyId = normalizeLegacyId(entry.id);
  const startURI = getStartURI(key, entry);
  if (!legacyId || !startURI) {
    return null;
  }
  const name = getName(entry);
  return {
    legacyId,
    legacyFileName: normalizeLegacyFileName(entry.name, legacyId),
    name,
    startURI,
    manifest: buildManifest(entry, startURI),
  };
}

function getMigrationStatePaths() {
  const directory = PathUtils.join(PathUtils.profileDir, "ssb");
  const path = PathUtils.join(directory, MIGRATION_STATE_FILENAME);
  return {
    directory,
    path,
    backupPath: `${path}.bak`,
    tmpPath: `${path}.tmp`,
  };
}

function validateMigrationState(data) {
  if (!isObject(data)) {
    return { status: "invalid" };
  }
  if (data.version > MIGRATION_STATE_VERSION) {
    return { status: "unsupported-version" };
  }
  const generation = data.generation ?? 0;
  if (
    data.version !== MIGRATION_STATE_VERSION ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    !Array.isArray(data.records) ||
    data.records.length > MAX_MIGRATION_STATE_ENTRIES
  ) {
    return { status: "invalid" };
  }

  const records = new Map();
  for (const rawRecord of data.records) {
    if (!isObject(rawRecord) || typeof rawRecord.tombstoned !== "boolean") {
      return { status: "invalid" };
    }
    const legacyId = normalizeLegacyId(rawRecord.legacyId);
    const taskbarTabId = normalizeTaskbarTabId(rawRecord.taskbarTabId);
    if (!legacyId || !taskbarTabId || records.has(legacyId)) {
      return { status: "invalid" };
    }
    const legacyFileName =
      rawRecord.legacyFileName === null ||
      rawRecord.legacyFileName === undefined
        ? null
        : normalizeLegacyFileName(rawRecord.legacyFileName, legacyId);
    if (rawRecord.legacyFileName != null && !legacyFileName) {
      return { status: "invalid" };
    }
    records.set(legacyId, {
      legacyId,
      legacyFileName,
      taskbarTabId,
      name: normalizeName(rawRecord.name),
      tombstoned: rawRecord.tombstoned,
    });
  }
  return { status: "ready", generation, records };
}

async function readMigrationStateFile(path) {
  try {
    if (!(await IOUtils.exists(path))) {
      return { status: "not-found" };
    }
    const stat = await IOUtils.stat(path);
    if (stat.type !== "regular" || stat.size > MAX_MIGRATION_STATE_BYTES) {
      return { status: "invalid" };
    }
    return validateMigrationState(await IOUtils.readJSON(path));
  } catch {
    return { status: "read-error" };
  }
}

async function loadMigrationState() {
  if (migrationState) {
    return migrationState;
  }

  const { path, backupPath, tmpPath } = getMigrationStatePaths();
  const [primary, backup, temporary] = await Promise.all([
    readMigrationStateFile(path),
    readMigrationStateFile(backupPath),
    readMigrationStateFile(tmpPath),
  ]);
  const candidates = [
    { source: "primary", value: primary },
    { source: "backup", value: backup },
    { source: "temporary", value: temporary },
  ].filter(candidate => candidate.value.status === "ready");

  if (candidates.length) {
    candidates.sort((a, b) => b.value.generation - a.value.generation);
    const selected = candidates[0];
    const records = new Map(
      Array.from(selected.value.records, ([legacyId, record]) => [
        legacyId,
        { ...record },
      ])
    );
    let needsRewrite = selected.source !== "primary";

    for (const candidate of candidates) {
      for (const [legacyId, record] of candidate.value.records) {
        if (!record.tombstoned) {
          continue;
        }
        const selectedRecord = records.get(legacyId);
        if (!selectedRecord?.tombstoned) {
          records.set(legacyId, { ...record, tombstoned: true });
          needsRewrite = true;
        }
      }
    }

    if (primary.status !== "ready") {
      for (const [legacyId, record] of records) {
        if (!record.tombstoned) {
          records.set(legacyId, { ...record, tombstoned: true });
        }
      }
      needsRewrite = true;
    }

    migrationState = {
      available: true,
      primaryValid: primary.status === "ready",
      needsRewrite,
      generation: selected.value.generation,
      records,
    };
    return migrationState;
  }

  if (
    primary.status === "not-found" &&
    backup.status === "not-found" &&
    temporary.status === "not-found"
  ) {
    migrationState = {
      available: true,
      primaryValid: false,
      needsRewrite: false,
      generation: 0,
      records: new Map(),
    };
    return migrationState;
  }

  console.warn("MidoriWebApps: Legacy SSB migration state is unreadable.");
  migrationState = { available: false, records: new Map() };
  return migrationState;
}

function cloneMigrationState(state) {
  return {
    available: true,
    primaryValid: state.primaryValid,
    needsRewrite: state.needsRewrite,
    generation: state.generation,
    records: new Map(
      Array.from(state.records, ([legacyId, record]) => [
        legacyId,
        { ...record },
      ])
    ),
  };
}

function serializeMigrationState(state) {
  return {
    version: MIGRATION_STATE_VERSION,
    generation: state.generation,
    records: Array.from(state.records.values())
      .map(record => ({ ...record }))
      .sort((a, b) => a.legacyId.localeCompare(b.legacyId)),
  };
}

async function persistMigrationState(nextState) {
  const { directory, path, backupPath, tmpPath } = getMigrationStatePaths();
  try {
    await IOUtils.makeDirectory(directory, {
      from: PathUtils.profileDir,
      ignoreExisting: true,
    });
    const options = { tmpPath, flush: true };
    if (migrationState?.primaryValid && (await IOUtils.exists(path))) {
      options.backupFile = backupPath;
    }
    nextState.generation++;
    await IOUtils.writeJSON(path, serializeMigrationState(nextState), options);
    nextState.primaryValid = true;
    nextState.needsRewrite = false;
    migrationState = nextState;
    return true;
  } catch (error) {
    console.warn("MidoriWebApps: Could not save legacy SSB state.", error);
    migrationState = { available: false, records: new Map() };
    return false;
  }
}

function runMigrationStateOperation(operation) {
  const pending = migrationStateQueue.then(operation, operation);
  migrationStateQueue = pending.catch(() => {});
  return pending;
}

function sameMigrationRecord(left, right) {
  return (
    left?.legacyId === right.legacyId &&
    left.legacyFileName === right.legacyFileName &&
    left.taskbarTabId === right.taskbarTabId &&
    left.name === right.name &&
    left.tombstoned === right.tombstoned
  );
}

function createLegacyMigrationReservation() {
  let resolve;
  const promise = new Promise(callback => {
    resolve = callback;
  });
  return { promise, resolve };
}

async function reserveLegacyApps(legacyApps) {
  return runMigrationStateOperation(async () => {
    if (pendingTaskbarRetirements.size) {
      return {
        retirementBarrier: Promise.all(
          Array.from(
            pendingTaskbarRetirements.values(),
            retirement => retirement.promise
          )
        ),
      };
    }

    const state = await loadMigrationState();
    if (!state.available) {
      return {
        items: legacyApps.map(() => ({
          kind: "completed",
          outcome: { status: "state-error" },
        })),
      };
    }

    return {
      items: legacyApps.map(legacyApp => {
        if (state.records.get(legacyApp.legacyId)?.tombstoned) {
          return {
            kind: "completed",
            outcome: { status: "tombstoned" },
          };
        }

        const existingReservation = legacyMigrationReservations.get(
          legacyApp.legacyId
        );
        if (existingReservation) {
          return { kind: "waiting", reservation: existingReservation };
        }

        const reservation = createLegacyMigrationReservation();
        legacyMigrationReservations.set(legacyApp.legacyId, reservation);
        return {
          kind: "owned",
          legacyApp,
          reservation,
        };
      }),
    };
  });
}

async function migrateLegacyAppInTaskbar(legacyApp, taskbarTabs) {
  try {
    const migration = await taskbarTabs.findOrCreateTaskbarTab(
      legacyApp.startURI,
      0,
      {
        manifest: legacyApp.manifest,
        awaitSystemIntegration: true,
        notify: false,
      }
    );
    let taskbarTab = migration.taskbarTab;
    if (!normalizeTaskbarTabId(taskbarTab?.id)) {
      throw new Error("The migrated Taskbar Tab has no valid ID.");
    }

    let integrationFailed = migration.integration?.ok === false;
    if (!migration.created && !taskbarTab?.shortcutRelativePath) {
      if (typeof taskbarTabs.repairTaskbarTab === "function") {
        try {
          const repairedTaskbarTab = await taskbarTabs.repairTaskbarTab(
            taskbarTab.id
          );
          if (
            repairedTaskbarTab?.id === taskbarTab.id &&
            repairedTaskbarTab.shortcutRelativePath
          ) {
            taskbarTab = repairedTaskbarTab;
          } else {
            integrationFailed = true;
          }
        } catch (error) {
          integrationFailed = true;
          console.warn(
            "MidoriWebApps: Could not repair a legacy SSB shortcut.",
            error
          );
        }
      } else {
        integrationFailed = true;
      }
    }

    const status = integrationFailed
      ? "integration-failed"
      : migration.created
        ? "created"
        : "deduplicated";
    return {
      status,
      created: !!migration.created,
      taskbarTab,
    };
  } catch (error) {
    console.warn("MidoriWebApps: Could not migrate a legacy SSB.", error);
    return { status: "failed" };
  }
}

async function commitLegacyMigrations(ownedMigrations) {
  if (!ownedMigrations.length) {
    return;
  }

  let outcomes = ownedMigrations.map(() => ({ status: "state-error" }));
  await runMigrationStateOperation(async () => {
    try {
      const state = await loadMigrationState();
      if (state.available) {
        const nextState = cloneMigrationState(state);
        let dirty = state.needsRewrite;
        outcomes = ownedMigrations.map(migration => {
          const { legacyApp, taskbarOutcome } = migration;
          const existingRecord = nextState.records.get(legacyApp.legacyId);
          if (existingRecord?.tombstoned) {
            return { status: "tombstoned" };
          }
          if (!taskbarOutcome.taskbarTab) {
            return taskbarOutcome;
          }

          const record = {
            legacyId: legacyApp.legacyId,
            legacyFileName:
              legacyApp.legacyFileName ??
              existingRecord?.legacyFileName ??
              null,
            taskbarTabId: taskbarOutcome.taskbarTab.id,
            name: legacyApp.name ?? existingRecord?.name ?? null,
            tombstoned: pendingTaskbarRetirements.has(
              taskbarOutcome.taskbarTab.id
            ),
          };
          if (!sameMigrationRecord(existingRecord, record)) {
            nextState.records.set(legacyApp.legacyId, record);
            dirty = true;
          }
          return record.tombstoned
            ? { status: "tombstoned" }
            : taskbarOutcome;
        });

        if (dirty && !(await persistMigrationState(nextState))) {
          outcomes = outcomes.map(outcome =>
            outcome.taskbarTab
              ? { ...outcome, status: "state-error" }
              : outcome
          );
        }
      }
    } catch (error) {
      console.warn("MidoriWebApps: Could not commit legacy SSB state.", error);
    }
  });

  for (let index = 0; index < ownedMigrations.length; index++) {
    const migration = ownedMigrations[index];
    migration.outcome = outcomes[index];
    if (["created", "deduplicated"].includes(migration.outcome.status)) {
      const cleanup = await cleanupLegacyIntegration(
        migration.legacyApp,
        migration.outcome.taskbarTab.shortcutRelativePath
      );
      if (cleanup.failed) {
        migration.outcome = {
          ...migration.outcome,
          status: "cleanup-failed",
        };
      }
    }
    if (
      legacyMigrationReservations.get(migration.legacyApp.legacyId) ===
      migration.reservation
    ) {
      legacyMigrationReservations.delete(migration.legacyApp.legacyId);
    }
    migration.reservation.resolve(migration.outcome);
  }
}

async function migrateLegacyAppsWithState(legacyApps, taskbarTabs) {
  let prepared;
  try {
    const reservation = await reserveLegacyApps(legacyApps);
    if (reservation.retirementBarrier) {
      await reservation.retirementBarrier;
      return migrateLegacyAppsWithState(legacyApps, taskbarTabs);
    }
    prepared = reservation.items;
  } catch (error) {
    console.warn("MidoriWebApps: Could not reserve legacy SSB state.", error);
    return legacyApps.map(() => ({ status: "state-error" }));
  }

  const ownedMigrations = prepared.filter(item => item.kind === "owned");
  let nextMigration = 0;
  const migrateNext = async () => {
    while (nextMigration < ownedMigrations.length) {
      const migration = ownedMigrations[nextMigration++];
      migration.taskbarOutcome = await migrateLegacyAppInTaskbar(
        migration.legacyApp,
        taskbarTabs
      );
    }
  };
  await Promise.all(
    Array.from(
      {
        length: Math.min(
          MAX_CONCURRENT_MIGRATIONS,
          ownedMigrations.length
        ),
      },
      migrateNext
    )
  );
  await commitLegacyMigrations(ownedMigrations);

  return Promise.all(
    prepared.map(item => {
      if (item.kind === "completed") {
        return item.outcome;
      }
      if (item.kind === "owned") {
        return item.outcome;
      }
      return item.reservation.promise;
    })
  );
}

async function readLegacyStore() {
  const path = PathUtils.join(PathUtils.profileDir, "ssb", "ssb.json");
  let exists;
  try {
    exists = await IOUtils.exists(path);
  } catch (error) {
    console.warn("MidoriWebApps: Could not inspect legacy SSB data.", error);
    return { status: "read-error" };
  }
  if (!exists) {
    return { status: "not-found" };
  }

  let store;
  try {
    const stat = await IOUtils.stat(path);
    if (stat.type !== "regular" || stat.size > MAX_STORE_BYTES) {
      return { status: "invalid-store" };
    }
    store = await IOUtils.readJSON(path);
  } catch (error) {
    console.warn("MidoriWebApps: Could not read legacy SSB data.", error);
    return { status: "read-error" };
  }

  if (!isObject(store)) {
    return { status: "invalid-store" };
  }

  const entries = Object.entries(store);
  if (entries.length > MAX_STORE_ENTRIES) {
    return { status: "store-too-large", total: entries.length };
  }
  return { status: "ready", entries };
}

/**
 * Imports persisted ESR128 site-specific browsers into Taskbar Tabs once.
 *
 * @param {object} taskbarTabs - The current Taskbar Tabs service.
 * @returns {Promise<object>} Migration status and per-entry counters.
 */
export async function migrateLegacySsbApps(taskbarTabs) {
  const result = newResult();
  if (!SUPPORTED_PLATFORMS.has(AppConstants.platform)) {
    return finish(result, "unsupported");
  }
  if (getCompletedVersion() >= LEGACY_SSB_MIGRATION_VERSION) {
    return finish(result, "already-completed", true);
  }
  if (typeof taskbarTabs?.findOrCreateTaskbarTab !== "function") {
    return finish(result, "taskbar-tabs-unavailable");
  }

  const legacyStore = await readLegacyStore();
  if (legacyStore.status === "not-found") {
    return markCompleted(result, "not-found");
  }
  if (legacyStore.status !== "ready") {
    result.total = legacyStore.total ?? 0;
    if (legacyStore.status === "invalid-store") {
      result.invalid = 1;
    }
    return finish(result, legacyStore.status);
  }

  result.total = legacyStore.entries.length;
  const legacyApps = [];
  for (const [key, entry] of legacyStore.entries) {
    result.processed++;
    const legacyApp = getLegacyApp(key, entry);
    if (!legacyApp) {
      result.invalid++;
      continue;
    }
    legacyApps.push(legacyApp);
  }

  const outcomes = await migrateLegacyAppsWithState(legacyApps, taskbarTabs);
  for (const outcome of outcomes) {
    if (outcome.taskbarTab) {
      if (outcome.created) {
        result.created++;
      } else {
        result.deduplicated++;
      }
    }
    if (outcome.status === "tombstoned") {
      result.tombstoned++;
    } else if (
      [
        "failed",
        "integration-failed",
        "cleanup-failed",
        "state-error",
      ].includes(outcome.status)
    ) {
      result.failed++;
    }
  }

  if (result.failed) {
    return finish(result, "partial");
  }
  return markCompleted(result, "completed");
}

/**
 * Restores one ESR128 site-specific browser referenced by its legacy ID.
 *
 * @param {string} id - The ESR128 site-specific browser ID.
 * @param {object} taskbarTabs - The current Taskbar Tabs service.
 * @returns {Promise<object|null>} The matching Taskbar Tab, or null.
 */
export async function migrateLegacySsbById(id, taskbarTabs) {
  const legacyId = normalizeLegacyId(id);
  if (
    !SUPPORTED_PLATFORMS.has(AppConstants.platform) ||
    !legacyId ||
    typeof taskbarTabs?.findOrCreateTaskbarTab !== "function"
  ) {
    return null;
  }

  const legacyStore = await readLegacyStore();
  if (legacyStore.status !== "ready") {
    return null;
  }

  for (const [key, entry] of legacyStore.entries) {
    if (!isObject(entry) || entry.id !== legacyId) {
      continue;
    }

    const legacyApp = getLegacyApp(key, entry);
    if (!legacyApp) {
      continue;
    }

    const [outcome] = await migrateLegacyAppsWithState(
      [legacyApp],
      taskbarTabs
    );
    return [
      "created",
      "deduplicated",
      "integration-failed",
      "cleanup-failed",
    ].includes(outcome.status)
      ? outcome.taskbarTab
      : null;
  }
  return null;
}

function getLegacyCleanupTargets(record) {
  const targets = [
    {
      path: PathUtils.join(PathUtils.profileDir, "ssb", record.legacyId),
      recursive: true,
    },
  ];
  const name = normalizeLegacyFileName(
    record.legacyFileName,
    record.legacyId
  );
  if (!name) {
    return targets;
  }

  if (AppConstants.platform === "linux") {
    const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
    targets.push({
      path: PathUtils.join(
        home,
        ".local",
        "share",
        "applications",
        `midori-${name}-${record.legacyId}.desktop`
      ),
      recursive: false,
    });
    targets.push({
      path: PathUtils.join(
        home,
        ".local",
        "share",
        "icons",
        "Midori_Web_Apps",
        `${name}.png`
      ),
      recursive: false,
    });
  }
  return targets;
}

function isMissingShortcutError(error) {
  return (
    error?.result === Cr.NS_ERROR_FILE_NOT_FOUND ||
    error?.name === "NS_ERROR_FILE_NOT_FOUND"
  );
}

function isSameWindowsShortcutPath(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.replaceAll("/", "\\").toLowerCase() ===
      right.replaceAll("/", "\\").toLowerCase()
  );
}

async function cleanupLegacyWindowsShortcut(
  record,
  protectedShortcutRelativePath = null
) {
  const name = normalizeLegacyFileName(
    record.legacyFileName,
    record.legacyId
  );
  if (!name) {
    return { removed: 0, failed: 0 };
  }

  const relativePath = `${name}.lnk`;
  if (isSameWindowsShortcutPath(relativePath, protectedShortcutRelativePath)) {
    return { removed: 0, failed: 0 };
  }
  try {
    lazy.ShellService.unpinShortcutFromTaskbar("Programs", relativePath);
  } catch (error) {
    if (!isMissingShortcutError(error)) {
      console.warn("MidoriWebApps: Could not unpin legacy SSB.", error);
      return { removed: 0, failed: 1 };
    }
  }

  try {
    await lazy.ShellService.deleteShortcut("Programs", relativePath);
    return { removed: 1, failed: 0 };
  } catch (error) {
    if (isMissingShortcutError(error)) {
      return { removed: 0, failed: 0 };
    }
    console.warn("MidoriWebApps: Could not delete legacy SSB shortcut.", error);
    return { removed: 0, failed: 1 };
  }
}

async function cleanupLegacyIntegration(
  record,
  protectedShortcutRelativePath = null
) {
  let removed = 0;
  let failed = 0;
  if (AppConstants.platform === "win") {
    const shortcut = await cleanupLegacyWindowsShortcut(
      record,
      protectedShortcutRelativePath
    );
    removed += shortcut.removed;
    failed += shortcut.failed;
  }

  let targets;
  try {
    targets = getLegacyCleanupTargets(record);
  } catch (error) {
    console.warn("MidoriWebApps: Could not resolve legacy SSB paths.", error);
    return { removed, failed: 1 };
  }

  for (const target of targets) {
    try {
      const existed = await IOUtils.exists(target.path);
      await IOUtils.remove(target.path, {
        recursive: target.recursive,
        ignoreAbsent: true,
      });
      if (existed) {
        removed++;
      }
    } catch (error) {
      failed++;
      console.warn("MidoriWebApps: Could not remove legacy SSB data.", error);
    }
  }
  return { removed, failed };
}

async function getUnmappedLegacyRetirementRecords(
  taskbarTab,
  taskbarTabs,
  state
) {
  const legacyStore = await readLegacyStore();
  if (legacyStore.status === "not-found") {
    return { status: "ready", records: [] };
  }
  if (legacyStore.status !== "ready") {
    return { status: "state-error", records: [] };
  }

  const records = [];
  for (const [key, entry] of legacyStore.entries) {
    const legacyApp = getLegacyApp(key, entry);
    if (!legacyApp || state.records.has(legacyApp.legacyId)) {
      continue;
    }
    if (
      !taskbarTab ||
      taskbarTab.userContextId !== 0 ||
      typeof taskbarTabs?.findTaskbarTab !== "function"
    ) {
      return { status: "state-error", records: [] };
    }

    let matches = false;
    if (legacyApp.manifest.scope) {
      const scope = parseURL(legacyApp.manifest.scope);
      matches =
        !!scope &&
        taskbarTab.scopes.some(
          candidate =>
            (candidate.origin ?? parseURL(taskbarTab.startUrl)?.prePath) ===
              scope.prePath &&
            (candidate.prefix ?? "/") === scope.filePath
        );
    } else {
      const resolved = await taskbarTabs.findTaskbarTab(
        legacyApp.startURI,
        0
      );
      matches = resolved?.id === taskbarTab.id;
    }
    if (matches) {
      records.push({
        legacyId: legacyApp.legacyId,
        legacyFileName: legacyApp.legacyFileName,
        taskbarTabId: taskbarTab.id,
        name: legacyApp.name,
        tombstoned: true,
      });
    }
  }
  return { status: "ready", records };
}

/**
 * Prevents legacy launchers from recreating an uninstalled Taskbar Tab.
 *
 * @param {object|string} taskbarTabOrId - The Taskbar Tab being uninstalled.
 * @param {object|Function|null} taskbarTabsOrOperation - Taskbar Tabs service,
 * or the removal operation when called with the legacy signature.
 * @param {Function|null} operation - Removal operation protected by the retirement barrier.
 * @returns {Promise<object>} The operation result, or retirement cleanup counters.
 */
export async function retireLegacySsbsForTaskbarTab(
  taskbarTabOrId,
  taskbarTabsOrOperation = null,
  operation = null
) {
  let taskbarTabs = taskbarTabsOrOperation;
  if (typeof taskbarTabsOrOperation === "function") {
    operation = taskbarTabsOrOperation;
    taskbarTabs = null;
  }
  if (operation !== null && typeof operation !== "function") {
    throw new TypeError("The retirement operation must be a function.");
  }

  const taskbarTab = isObject(taskbarTabOrId) ? taskbarTabOrId : null;
  const normalizedTaskbarTabId = normalizeTaskbarTabId(
    taskbarTab?.id ?? taskbarTabOrId
  );
  const result = {
    status: "pending",
    matched: 0,
    tombstoned: 0,
    removed: 0,
    cleanupFailed: 0,
  };
  if (!SUPPORTED_PLATFORMS.has(AppConstants.platform)) {
    const finalResult = Object.freeze({ ...result, status: "unsupported" });
    return operation ? operation() : finalResult;
  }
  if (!normalizedTaskbarTabId) {
    const finalResult = Object.freeze({ ...result, status: "invalid-id" });
    return operation ? operation() : finalResult;
  }

  let preparation;
  try {
    preparation = await runMigrationStateOperation(async () => {
      const existingRetirement = pendingTaskbarRetirements.get(
        normalizedTaskbarTabId
      );
      if (existingRetirement) {
        return { owned: false, retirement: existingRetirement };
      }

      const retirement = createLegacyMigrationReservation();
      pendingTaskbarRetirements.set(normalizedTaskbarTabId, retirement);
      return {
        owned: true,
        retirement,
        migrations: Array.from(
          legacyMigrationReservations.values(),
          migration => migration.promise
        ),
      };
    });
  } catch (error) {
    throw new Error("Could not reserve legacy SSB retirement.", {
      cause: error,
    });
  }

  if (!preparation.owned) {
    const completion = await preparation.retirement.promise;
    if (completion.error) {
      throw completion.error;
    }
    if (operation) {
      return retireLegacySsbsForTaskbarTab(
        taskbarTabOrId,
        taskbarTabs,
        operation
      );
    }
    return completion.result;
  }

  const { retirement } = preparation;
  let completion;
  try {
    await Promise.all(preparation.migrations);
    const retiredState = await runMigrationStateOperation(async () => {
      const state = await loadMigrationState();
      if (!state.available) {
        return { status: "state-error", records: [], tombstoned: 0 };
      }

      const matchingRecords = Array.from(state.records.values()).filter(
        record => record.taskbarTabId === normalizedTaskbarTabId
      );
      const unmapped = await getUnmappedLegacyRetirementRecords(
        taskbarTab,
        taskbarTabs,
        state
      );
      if (unmapped.status !== "ready") {
        return { status: "state-error", records: [], tombstoned: 0 };
      }

      const nextState = cloneMigrationState(state);
      let dirty = state.needsRewrite;
      let tombstoned = 0;
      for (const record of matchingRecords) {
        if (!record.tombstoned) {
          nextState.records.set(record.legacyId, {
            ...record,
            tombstoned: true,
          });
          dirty = true;
          tombstoned++;
        }
      }
      for (const record of unmapped.records) {
        nextState.records.set(record.legacyId, record);
        matchingRecords.push(record);
        dirty = true;
        tombstoned++;
      }
      if (!matchingRecords.length) {
        return { status: "not-mapped", records: [], tombstoned: 0 };
      }
      if (dirty && !(await persistMigrationState(nextState))) {
        return { status: "state-error", records: [], tombstoned: 0 };
      }
      return {
        status: "retired",
        records: matchingRecords.map(record => ({
          ...nextState.records.get(record.legacyId),
        })),
        tombstoned,
      };
    });

    result.status = retiredState.status;
    result.matched = retiredState.records.length;
    result.tombstoned = retiredState.tombstoned;
    if (retiredState.status === "state-error") {
      throw new Error("Could not establish durable legacy SSB retirement state.");
    }

    const operationResult = operation ? await operation() : undefined;
    if (retiredState.status === "retired") {
      for (const record of retiredState.records) {
        const cleanup = await cleanupLegacyIntegration(record);
        result.removed += cleanup.removed;
        result.cleanupFailed += cleanup.failed;
      }
    }

    const finalResult = Object.freeze(result);
    completion = { result: finalResult };
    return operation ? operationResult : finalResult;
  } catch (error) {
    completion = { error };
    throw error;
  } finally {
    if (
      pendingTaskbarRetirements.get(normalizedTaskbarTabId) === retirement
    ) {
      pendingTaskbarRetirements.delete(normalizedTaskbarTabId);
    }
    retirement.resolve(completion);
  }
}
