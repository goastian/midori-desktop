#!/bin/bash

set -e

# Patch @goastian/amelia to fix:
# 1) multi-locale packaging bug from trailing empty lines
# 2) addon download flow issues in CI:
#    - git identity requirement during addon initialization
#    - hard failure when browser/extensions/moz.build is not present

AMELIA_PKG="node_modules/@goastian/amelia/dist/commands/package.js"
AMELIA_ADDON="node_modules/@goastian/amelia/dist/commands/download/addon.js"
AMELIA_BRANDING="node_modules/@goastian/amelia/dist/commands/patches/branding-patch.js"

if [ -f "$AMELIA_PKG" ]; then
  if grep -q "split('\\\\n').filter(Boolean)" "$AMELIA_PKG"; then
    echo "[patch-amelia] package.js locale fix already applied."
  else
    sed -i "s|return localesText.split('\\\\n');|return localesText.split('\\\\n').filter(Boolean);|" "$AMELIA_PKG"
    if grep -q "split('\\\\n').filter(Boolean)" "$AMELIA_PKG"; then
      echo "[patch-amelia] Patched package.js locale parsing."
    else
      echo "[patch-amelia] WARNING: Could not patch package.js locale parsing."
    fi
  fi

  node <<'NODE'
const fs = require('node:fs');

const file = 'node_modules/@goastian/amelia/dist/commands/package.js';
if (!fs.existsSync(file)) {
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

// Tor preflight: only enforce when Tor is actually available for the target.
// Tor Expert Bundle is NOT available for linux-aarch64 or windows-aarch64.
// Flatpak builds intentionally omit the embedded Tor runtime.
// Check if the conditional version is already applied
if (content.includes('_torUnavailable')) {
  content = content.replace(
    /const _torUnavailable = \(_torArch === 'aarch64' && \(_torPlatform === 'linux' \|\| _torPlatform === 'win32'\)\);/g,
    "const _torUnavailable = process.env.MIDORI_FLATPAK === '1' || (_torArch === 'aarch64' && (_torPlatform === 'linux' || _torPlatform === 'win32'));"
  );
} else if (content.includes("const torDir = (0, node_path_1.join)(constants_1.OBJ_DIR, 'dist', 'bin', 'tor');")) {
  // Old unconditional Tor check exists — replace with conditional version
  const oldTorBlock = `        const torDir = (0, node_path_1.join)(constants_1.OBJ_DIR, 'dist', 'bin', 'tor');
        const torBinaryPath = process.ameliaPlatform == 'win32'
            ? (0, node_path_1.join)(torDir, 'tor.exe')
            : (0, node_path_1.join)(torDir, 'tor');
        const torGeoIpPath = (0, node_path_1.join)(torDir, 'geoip');
        const torGeoIp6Path = (0, node_path_1.join)(torDir, 'geoip6');
        if (!(0, node_fs_1.existsSync)(torBinaryPath) || !(0, node_fs_1.existsSync)(torGeoIpPath) || !(0, node_fs_1.existsSync)(torGeoIp6Path)) {
            log_1.log.error(\`Tor runtime files are missing in \${torDir}. Run scripts/download-tor.sh for the target platform before packaging.\`);
        }`;
  const newTorBlock = `        // Tor is only available for x86_64 on Linux/Windows; macOS has both x86_64 and aarch64.
        const _torPlatform = process.env.AMELIA_PLATFORM || '';
        const _torArch = process.env.AMELIA_COMPAT || '';
        const _torUnavailable = process.env.MIDORI_FLATPAK === '1' || (_torArch === 'aarch64' && (_torPlatform === 'linux' || _torPlatform === 'win32'));
        if (!_torUnavailable) {
            const torDir = (0, node_path_1.join)(constants_1.OBJ_DIR, 'dist', 'bin', 'tor');
            const torBinaryPath = process.ameliaPlatform == 'win32'
                ? (0, node_path_1.join)(torDir, 'tor.exe')
                : (0, node_path_1.join)(torDir, 'tor');
            const torGeoIpPath = (0, node_path_1.join)(torDir, 'geoip');
            const torGeoIp6Path = (0, node_path_1.join)(torDir, 'geoip6');
            if (!(0, node_fs_1.existsSync)(torBinaryPath) || !(0, node_fs_1.existsSync)(torGeoIpPath) || !(0, node_fs_1.existsSync)(torGeoIp6Path)) {
                log_1.log.error('Tor runtime files are missing in ' + torDir + '. Run scripts/download-tor.sh for the target platform before packaging.');
            }
        } else {
            log_1.log.info('Tor is not available for ' + _torPlatform + '-' + _torArch + '. Skipping Tor preflight check.');
        }`;
  content = content.replace(oldTorBlock, newTorBlock);
} else {
  // No Tor check at all — insert the conditional version
  const packageArgsLine = "        const arguments_ = ['package'];";
  const torPreflightBlock = `        const arguments_ = ['package'];
        // Tor is only available for x86_64 on Linux/Windows; macOS has both x86_64 and aarch64.
        const _torPlatform = process.env.AMELIA_PLATFORM || '';
        const _torArch = process.env.AMELIA_COMPAT || '';
        const _torUnavailable = process.env.MIDORI_FLATPAK === '1' || (_torArch === 'aarch64' && (_torPlatform === 'linux' || _torPlatform === 'win32'));
        if (!_torUnavailable) {
            const torDir = (0, node_path_1.join)(constants_1.OBJ_DIR, 'dist', 'bin', 'tor');
            const torBinaryPath = process.ameliaPlatform == 'win32'
                ? (0, node_path_1.join)(torDir, 'tor.exe')
                : (0, node_path_1.join)(torDir, 'tor');
            const torGeoIpPath = (0, node_path_1.join)(torDir, 'geoip');
            const torGeoIp6Path = (0, node_path_1.join)(torDir, 'geoip6');
            if (!(0, node_fs_1.existsSync)(torBinaryPath) || !(0, node_fs_1.existsSync)(torGeoIpPath) || !(0, node_fs_1.existsSync)(torGeoIp6Path)) {
                log_1.log.error('Tor runtime files are missing in ' + torDir + '. Run scripts/download-tor.sh for the target platform before packaging.');
            }
        } else {
            log_1.log.info('Tor is not available for ' + _torPlatform + '-' + _torArch + '. Skipping Tor preflight check.');
        }`;
  if (content.includes(packageArgsLine)) {
    content = content.replace(packageArgsLine, torPreflightBlock);
  }
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

fs.writeFileSync(file, content, 'utf8');
NODE

  if grep -Fq "Tor runtime files are missing" "$AMELIA_PKG" && grep -Fq '`mach package-multi-locale` failed. Multi-language packaging was not applied.' "$AMELIA_PKG"; then
    echo "[patch-amelia] Added hard-fail checks for package and package-multi-locale."
  else
    echo "[patch-amelia] WARNING: Could not verify package.js hard-fail checks."
  fi
fi

if [ -f "$AMELIA_BRANDING" ]; then
  if grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ?" "$AMELIA_BRANDING"; then
    echo "[patch-amelia] branding-patch.js fallback already applied."
  else
    node <<'NODE'
const fs = require('node:fs');

const file = 'node_modules/@goastian/amelia/dist/commands/patches/branding-patch.js';
if (!fs.existsSync(file)) {
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

const source = "const BRANDING_FF = (0, node_path_1.join)(BRANDING_STORE, 'unofficial');";
const replacement = "const BRANDING_FF = (0, node_fs_1.existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ? (0, node_path_1.join)(BRANDING_STORE, 'unofficial') : (0, node_path_1.join)(BRANDING_STORE, 'official');";

if (content.includes(source) && !content.includes("existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ?")) {
  content = content.replace(source, replacement);
}

fs.writeFileSync(file, content, 'utf8');
NODE

    if grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ?" "$AMELIA_BRANDING"; then
      echo "[patch-amelia] Patched branding-patch.js with unofficial->official fallback."
    else
      echo "[patch-amelia] WARNING: Could not patch branding-patch.js fallback."
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
