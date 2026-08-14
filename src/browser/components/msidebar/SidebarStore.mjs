import { createDefaultStore, validateStore } from './SidebarModel.mjs';

function getStorePath() {
  return PathUtils.join(PathUtils.profileDir, 'midori-msidebar.json');
}

function getBackupPath() {
  return `${getStorePath()}.bak`;
}

async function readValidStore(path) {
  try {
    if (!(await IOUtils.exists(path))) return null;
    return validateStore(await IOUtils.readJSON(path));
  } catch {
    return null;
  }
}

export async function loadStore() {
  const path = getStorePath();
  try {
    const store = await readValidStore(path);
    if (store) return store;
    const backup = await readValidStore(getBackupPath());
    if (backup) {
      await IOUtils.writeJSON(path, backup);
      return backup;
    }
    if (!(await IOUtils.exists(path))) {
      const def = createDefaultStore();
      await IOUtils.writeJSON(path, def);
      return def;
    }
    return createDefaultStore();
  } catch {
    const def = createDefaultStore();
    try {
      await IOUtils.writeJSON(path, def);
    } catch {}
    return def;
  }
}

export async function saveStore(store) {
  const path = getStorePath();
  const validated = validateStore(store);
  const tmpPath = `${path}.tmp`;
  await IOUtils.writeJSON(tmpPath, validated);
  try {
    if (await IOUtils.exists(path)) {
      await IOUtils.copy(path, getBackupPath());
    }
    await IOUtils.move(tmpPath, path, { overwrite: true });
  } catch (error) {
    try {
      await IOUtils.remove(tmpPath);
    } catch {}
    throw error;
  }
  return validated;
}
