function pickIconPath(icon) {
  if (!icon) return '';
  if (typeof icon === 'string') return icon;
  if (typeof icon !== 'object') return '';
  let bestKey = null;
  let bestSize = -1;
  for (const key of Object.keys(icon)) {
    const size = Number.parseInt(key, 10);
    if (!Number.isFinite(size)) continue;
    if (size > bestSize) {
      bestSize = size;
      bestKey = key;
    }
  }
  if (bestKey && typeof icon[bestKey] === 'string') return icon[bestKey];
  for (const value of Object.values(icon)) {
    if (typeof value === 'string') return value;
  }
  return '';
}

function normalizeMozExtensionUrl(pathOrUrl, baseUrl) {
  if (typeof pathOrUrl !== 'string' || !pathOrUrl) return '';
  try {
    const resolved = baseUrl ? new URL(pathOrUrl, baseUrl).toString() : new URL(pathOrUrl).toString();
    return resolved.startsWith('moz-extension://') ? resolved : '';
  } catch {
    return '';
  }
}

function getPolicyApi(globalObj) {
  if (globalObj?.WebExtensionPolicy) return globalObj.WebExtensionPolicy;
  try {
    return Cu.getGlobalForObject(Services)?.WebExtensionPolicy || null;
  } catch {
    return null;
  }
}

function sidebarActionForPolicy(policy) {
  const manifest = policy?.manifest;
  if (!manifest || typeof manifest !== 'object') return null;
  const sidebarAction = manifest.sidebar_action || manifest.sidebarAction;
  if (!sidebarAction || typeof sidebarAction !== 'object') return null;
  const defaultPanel = sidebarAction.default_panel || sidebarAction.defaultPanel;
  if (typeof defaultPanel !== 'string' || !defaultPanel) return null;
  return { manifest, sidebarAction, defaultPanel };
}

function policyBaseUrl(policy) {
  try {
    const fromApi = policy?.getURL?.('/');
    if (typeof fromApi === 'string' && fromApi.startsWith('moz-extension://')) return fromApi;
  } catch {}
  if (typeof policy?.baseURL === 'string' && policy.baseURL.startsWith('moz-extension://')) {
    return policy.baseURL;
  }
  if (typeof policy?.mozExtensionHostname === 'string' && policy.mozExtensionHostname) {
    return `moz-extension://${policy.mozExtensionHostname}/`;
  }
  return '';
}

function panelInfoFromPolicy(policy) {
  const sidebarInfo = sidebarActionForPolicy(policy);
  if (!sidebarInfo) return null;

  const baseUrl = policyBaseUrl(policy);
  const panelUrl = normalizeMozExtensionUrl(sidebarInfo.defaultPanel, baseUrl);
  if (!panelUrl) return null;

  const titleRaw = sidebarInfo.sidebarAction.default_title || sidebarInfo.sidebarAction.defaultTitle || policy?.name || '';
  const title = typeof titleRaw === 'string' ? titleRaw : '';

  const iconPath = pickIconPath(sidebarInfo.sidebarAction.default_icon || sidebarInfo.sidebarAction.defaultIcon || sidebarInfo.manifest.icons);
  const iconUrl = normalizeMozExtensionUrl(iconPath, baseUrl);

  return {
    extensionId: typeof policy?.id === 'string' ? policy.id : '',
    url: panelUrl,
    title,
    iconUrl,
  };
}

function extensionHostFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'moz-extension:') return '';
    return parsed.host || '';
  } catch {
    return '';
  }
}

export function resolveSidebarActionPanelForExtensionId(extensionId, { policyApi, globalObj } = {}) {
  if (typeof extensionId !== 'string' || !extensionId) return null;
  const api = policyApi || getPolicyApi(globalObj);
  if (!api?.getByID) return null;
  try {
    return panelInfoFromPolicy(api.getByID(extensionId));
  } catch {
    return null;
  }
}

export function resolveSidebarActionPanelForUrl(url, { policyApi, globalObj } = {}) {
  if (typeof url !== 'string' || !url) return null;
  if (!url.startsWith('moz-extension://')) return null;

  const api = policyApi || getPolicyApi(globalObj);
  if (!api) return null;

  let policy = null;
  if (api.getByURI) {
    try {
      const uri = Services?.io?.newURI ? Services.io.newURI(url) : url;
      policy = api.getByURI(uri) || null;
    } catch {}
  }

  if (!policy && api.getByHostname) {
    try {
      const host = extensionHostFromUrl(url);
      if (host) policy = api.getByHostname(host) || null;
    } catch {}
  }

  return panelInfoFromPolicy(policy);
}
