import { createDefaultStore, validateStore } from './SidebarModel.mjs';

function getStorePath() {
  return PathUtils.join(PathUtils.profileDir, 'midori-msidebar.json');
}

export async function loadStore() {
  const path = getStorePath();
  try {
    const exists = await IOUtils.exists(path);
    if (!exists) {
      const def = createDefaultStore();
      await IOUtils.writeJSON(path, def);
      return def;
    }
    const json = await IOUtils.readJSON(path);
    const validated = validateStore(json);
    if (!storesEqualLoose(json, validated)) {
      await IOUtils.writeJSON(path, validated);
    }
    return validated;
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
    await IOUtils.move(tmpPath, path, { overwrite: true });
  } catch (error) {
    try {
      await IOUtils.remove(tmpPath);
    } catch {}
    throw error;
  }
  return validated;
}

function storesEqualLoose(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
