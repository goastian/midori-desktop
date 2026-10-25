#!/bin/bash

set -e

# Patch @goastian/amelia to fix:
# 1) multi-locale packaging bug from trailing empty lines
# 2) addon download flow issues in CI:
#    - git identity requirement during addon initialization
#    - hard failure when browser/extensions/moz.build is not present
# 3) obsolete Tor preflight and target selection during packaging.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

AMELIA_PKG="node_modules/@goastian/amelia/dist/commands/package.js"
AMELIA_ADDON="node_modules/@goastian/amelia/dist/commands/download/addon.js"
AMELIA_BRANDING="node_modules/@goastian/amelia/dist/commands/patches/branding-patch.js"

if [ -f "$AMELIA_PKG" ]; then
  node <<'NODE'
const fs = require('node:fs');
const vm = require('node:vm');

const file = 'node_modules/@goastian/amelia/dist/commands/package.js';
if (!fs.existsSync(file)) {
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

const localeCall = "return localesText.split('\\n');";
const localeReplacement = "return localesText.split('\\n').filter(Boolean);";
if (content.includes(localeCall)) {
  content = content.replace(localeCall, localeReplacement);
}

if (!content.includes('mach package` failed. Aborting to avoid shipping stale artifacts.')) {
  const packageCall = "        await (0, utils_1.dispatch)(machPath, arguments_, constants_1.ENGINE_DIR, true);";
  const packageReplacement = "        const packageResult = await (0, utils_1.dispatch)(machPath, arguments_, constants_1.ENGINE_DIR, true);\n        if (!packageResult.success) {\n            log_1.log.error('`mach package` failed. Aborting to avoid shipping stale artifacts.');\n        }";
  if (content.includes(packageCall)) {
    content = content.replace(packageCall, packageReplacement);
  }
}

if (!content.includes('mach package-multi-locale` failed. Multi-language packaging was not applied.')) {
  const multiLocaleCall = "        await (0, utils_1.dispatch)(machPath, ['package-multi-locale', '--locales', ...(await getLocales())], constants_1.ENGINE_DIR, true);";
  const multiLocaleReplacement = "        const multiLocaleResult = await (0, utils_1.dispatch)(machPath, ['package-multi-locale', '--locales', ...(await getLocales())], constants_1.ENGINE_DIR, true);\n        if (!multiLocaleResult.success) {\n            log_1.log.error('`mach package-multi-locale` failed. Multi-language packaging was not applied.');\n        }";
  if (content.includes(multiLocaleCall)) {
    content = content.replace(multiLocaleCall, multiLocaleReplacement);
  }
}

content = content.replace(
  /        if \(product\.id === 'firefox'\) \{\r?\n            verifyTorRuntimeIfRequired\(\);\r?\n        \}\r?\n/,
  ''
);
if (/\bverifyTorRuntimeIfRequired\s*\([^)]*\)\s*;/.test(content)) {
  throw new Error('[patch-amelia] Unsupported Tor preflight in Amelia; update the packaging patch.');
}

content = content.replace(
  /dispatch\)\(machPath, arguments_, constants_1\.ENGINE_DIR, true\)/g,
  'dispatch)(machPath, arguments_, constants_1.OBJ_DIR, true)'
).replace(
  /dispatch\)\(machPath, \['package-multi-locale', '--locales', \.\.\.\(await getLocales\(\)\)\], constants_1\.ENGINE_DIR, true\)/g,
  "dispatch)(machPath, ['package-multi-locale', '--locales', ...(await getLocales())], constants_1.OBJ_DIR, true)"
);

if (!content.includes('No configured build for packaging:')) {
  content = content.replace(
    "        const arguments_ = ['package'];",
    "        if (!(0, node_fs_1.existsSync)((0, node_path_1.join)(constants_1.OBJ_DIR, 'mozinfo.json'))) {\n            log_1.log.error(`No configured build for packaging: ${constants_1.OBJ_DIR}. Run the matching build command first.`);\n        }\n        const arguments_ = ['package'];"
  );
}

const marCall = "    await (0, utils_1.configDispatch)('./tools/update-packaging/make_full_update.sh', {";
const marReplacement = "    if ((0, node_fs_1.existsSync)(marPath)) {\n        await (0, promises_1.unlink)(marPath);\n    }\n    const marResult = await (0, utils_1.configDispatch)('./tools/update-packaging/make_full_update.sh', {";
if (content.includes(marCall)) {
  content = content.replace(marCall, marReplacement).replace(
    '    return marPath;',
    "    if (!marResult.success || !(0, node_fs_1.existsSync)(marPath) || (0, node_fs_1.statSync)(marPath).size === 0) {\n        log_1.log.error('MAR creation failed. Aborting to avoid shipping stale artifacts.');\n    }\n    return marPath;"
  );
}

for (const required of [
  'return localesText.split(\'\\n\').filter(Boolean);',
  'mach package` failed. Aborting to avoid shipping stale artifacts.',
  'mach package-multi-locale` failed. Multi-language packaging was not applied.',
  'MAR creation failed. Aborting to avoid shipping stale artifacts.',
  'No configured build for packaging:',
  'dispatch)(machPath, arguments_, constants_1.OBJ_DIR, true)',
  "dispatch)(machPath, ['package-multi-locale', '--locales', ...(await getLocales())], constants_1.OBJ_DIR, true)",
]) {
  if (!content.includes(required)) {
    throw new Error(`[patch-amelia] Unsupported Amelia packaging code: ${required}`);
  }
}

new vm.Script(content, { filename: file });
fs.writeFileSync(file, content, 'utf8');
NODE

  echo "[patch-amelia] package.js locale fix applied."
  echo "[patch-amelia] Added hard-fail checks for package and package-multi-locale."
  echo "[patch-amelia] Removed obsolete Tor preflight; packaging and MAR failures remain fatal."
fi

if [ -f node_modules/@goastian/amelia/dist/constants/index.js ]; then
  node <<'NODE'
const fs = require('node:fs');
const vm = require('node:vm');
const file = 'node_modules/@goastian/amelia/dist/constants/index.js';
let content = fs.readFileSync(file, 'utf8');
if (!content.includes('const midoriObjectTargets =')) {
  const original = "let CONFIG_GUESS = '';";
  const replacement = `const midoriObjectTargets = {
    linux: { x86_64: 'x86_64-pc-linux-gnu', aarch64: 'aarch64-unknown-linux-gnu' },
    win32: { x86_64: 'x86_64-pc-windows-msvc', aarch64: 'aarch64-pc-windows-msvc' },
};
const midoriTargetPlatform = process.env.AMELIA_PLATFORM || process.platform;
const midoriTargetArch = process.env.AMELIA_COMPAT || process.env.SURFER_COMPAT || ({ x64: 'x86_64', arm64: 'aarch64' })[process.arch];
let CONFIG_GUESS = midoriObjectTargets[midoriTargetPlatform]?.[midoriTargetArch] || '';`;
  if (!content.includes(original) || !content.includes('if ((0, node_fs_1.existsSync)(exports.ENGINE_DIR)) {')) {
    throw new Error('[patch-amelia] Unsupported Amelia object directory selection.');
  }
  content = content.replace(original, replacement).replace(
    'if ((0, node_fs_1.existsSync)(exports.ENGINE_DIR)) {',
    'if (!CONFIG_GUESS && (0, node_fs_1.existsSync)(exports.ENGINE_DIR)) {'
  );
}
content = content.replace(
  'const midoriTargetArch = process.env.AMELIA_COMPAT || process.env.SURFER_COMPAT;',
  "const midoriTargetArch = process.env.AMELIA_COMPAT || process.env.SURFER_COMPAT || ({ x64: 'x86_64', arm64: 'aarch64' })[process.arch];"
);
new vm.Script(content, { filename: file });
fs.writeFileSync(file, content, 'utf8');
NODE
  echo "[patch-amelia] Object directory selection respects the requested Linux/Windows target."
fi

if [ -f "$AMELIA_BRANDING" ]; then
  _brand_unofficial_patched=false
  _brand_official_patched=false
  grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ?" "$AMELIA_BRANDING" && _brand_unofficial_patched=true
  grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'official')) ?" "$AMELIA_BRANDING" && _brand_official_patched=true

  if [ "$_brand_unofficial_patched" = "true" ] && [ "$_brand_official_patched" = "true" ]; then
    echo "[patch-amelia] branding-patch.js fallbacks already applied."
  else
    node <<'NODE'
const fs = require('node:fs');

const file = 'node_modules/@goastian/amelia/dist/commands/patches/branding-patch.js';
if (!fs.existsSync(file)) {
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

// Patch 1: unofficial → official fallback (release brand)
// If engine/browser/branding/unofficial is missing, fall back to official.
const unofficialSource = "const BRANDING_FF = (0, node_path_1.join)(BRANDING_STORE, 'unofficial');";
const unofficialReplacement = "const BRANDING_FF = (0, node_fs_1.existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ? (0, node_path_1.join)(BRANDING_STORE, 'unofficial') : (0, node_path_1.join)(BRANDING_STORE, 'official');";

if (content.includes(unofficialSource) && !content.includes("existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ?")) {
  content = content.replace(unofficialSource, unofficialReplacement);
}

// Patch 2: official → unofficial fallback (dawn brand)
// engine/browser/branding/official does not exist in the public Firefox source.
// If it is missing, fall back to unofficial so the branding patch can proceed.
const officialSource = "const BRANDING_FF = (0, node_path_1.join)(BRANDING_STORE, 'official');";
const officialReplacement = "const BRANDING_FF = (0, node_fs_1.existsSync)((0, node_path_1.join)(BRANDING_STORE, 'official')) ? (0, node_path_1.join)(BRANDING_STORE, 'official') : (0, node_path_1.join)(BRANDING_STORE, 'unofficial');";

if (content.includes(officialSource) && !content.includes("existsSync)((0, node_path_1.join)(BRANDING_STORE, 'official')) ?")) {
  content = content.replace(officialSource, officialReplacement);
}

fs.writeFileSync(file, content, 'utf8');
NODE

    if grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ?" "$AMELIA_BRANDING" ||
      grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'official')) ?" "$AMELIA_BRANDING"; then
      echo "[patch-amelia] Patched branding-patch.js with branding directory fallbacks."
    else
      echo "[patch-amelia] WARNING: Could not patch branding-patch.js fallbacks."
    fi
  fi
fi

if [ -f "$AMELIA_ADDON" ]; then
  node <<'NODE'
const fs = require('node:fs');

const file = 'node_modules/@goastian/amelia/dist/commands/download/addon.js';
if (!fs.existsSync(file)) {
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

const initLine = "    log_1.log.info(`Initializing addon...`);";
const initReplacement = "    log_1.log.info(`Initializing addon... (skip git commit)`);\n    return;";
if (content.includes(initLine) && !content.includes('Initializing addon... (skip git commit)')) {
  content = content.replace(initLine, initReplacement);
}

const oldMozbuildSnippet = "    await (0, discard_1.discard)('browser/extensions/moz.build');\n    const path = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'browser', 'extensions', 'moz.build');";
const firstPatchedMozbuildSnippet = "    const mozbuildPath = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'browser', 'extensions', 'moz.build');\n    const appMozbuildPath = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'browser', 'extensions', 'app.mozbuild');\n    const path = (0, node_fs_1.existsSync)(mozbuildPath) ? mozbuildPath : appMozbuildPath;\n    if ((0, node_fs_1.existsSync)(mozbuildPath)) {\n        await (0, discard_1.discard)('browser/extensions/moz.build');\n    }";
const robustMozbuildBlock = "    const mozbuildPath = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'browser', 'extensions', 'moz.build');\n    const appMozbuildPath = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'browser', 'extensions', 'app.mozbuild');\n    if ((0, node_fs_1.existsSync)(mozbuildPath)) {\n        await (0, discard_1.discard)('browser/extensions/moz.build');\n    }\n    const targetMozbuildPath = (0, node_fs_1.existsSync)(mozbuildPath)\n        ? mozbuildPath\n        : ((0, node_fs_1.existsSync)(appMozbuildPath) ? appMozbuildPath : mozbuildPath);\n    if (!(0, node_fs_1.existsSync)(targetMozbuildPath)) {\n        (0, node_fs_1.writeFileSync)(targetMozbuildPath, 'DIRS += []\\n');\n    }";

if (content.includes(oldMozbuildSnippet)) {
  content = content.replace(oldMozbuildSnippet, robustMozbuildBlock);
} else if (content.includes(firstPatchedMozbuildSnippet)) {
  content = content.replace(firstPatchedMozbuildSnippet, robustMozbuildBlock);
}

content = content.replace(
  /const mozbuildPath = \(0, node_path_1\.join\)\(constants_1\.ENGINE_DIR, 'browser', 'extensions', 'moz\.build'\);[\s\S]*?\/\/ Append all the files to the bottom/m,
  `${robustMozbuildBlock}\n    // Append all the files to the bottom`
);

content = content.replace(
  "    // Append all the files to the bottom\\n    (0, node_fs_1.writeFileSync)(path, `${(0, node_fs_1.readFileSync)(path).toString()}\\nDIRS += [${addons",
  "    // Append all the files to the bottom\\n    (0, node_fs_1.writeFileSync)(targetMozbuildPath, `${(0, node_fs_1.readFileSync)(targetMozbuildPath).toString()}\\nDIRS += [${addons"
);

content = content.replace(
  "    (0, node_fs_1.writeFileSync)(path, `${(0, node_fs_1.readFileSync)(path).toString()}\\nDIRS += [${addons",
  "    (0, node_fs_1.writeFileSync)(targetMozbuildPath, `${(0, node_fs_1.readFileSync)(targetMozbuildPath).toString()}\\nDIRS += [${addons"
);

fs.writeFileSync(file, content, 'utf8');
NODE

  if grep -q "Initializing addon... (skip git commit)" "$AMELIA_ADDON" && grep -q "targetMozbuildPath" "$AMELIA_ADDON"; then
    echo "[patch-amelia] Patched addon.js for CI-safe addon initialization and robust mozbuild fallback."
  else
    echo "[patch-amelia] WARNING: Could not fully patch addon.js."
  fi
fi
