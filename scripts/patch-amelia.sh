#!/bin/bash

set -e

# Patch @goastian/amelia to fix:
# 1) multi-locale packaging bug from trailing empty lines
# 2) addon download flow issues in CI:
#    - git identity requirement during addon initialization
#    - hard failure when browser/extensions/moz.build is not present
# 3) branding patch assumptions in CI source trees:
#    - missing shared.nsh on non-Windows imports
#    - missing build/application.ini.in during early imports
# 4) copy-patches assumptions in CI source trees:
#    - missing engine/.gitignore during manual patch linking
# 5) download assumptions in CI source trees:
#    - partial engine/ directory should not suppress Firefox source download

AMELIA_PKG="node_modules/@goastian/amelia/dist/commands/package.js"
AMELIA_ADDON="node_modules/@goastian/amelia/dist/commands/download/addon.js"
AMELIA_BRANDING="node_modules/@goastian/amelia/dist/commands/patches/branding-patch.js"
AMELIA_COPY_PATCHES="node_modules/@goastian/amelia/dist/commands/patches/copy-patches.js"
AMELIA_DOWNLOAD_FIREFOX="node_modules/@goastian/amelia/dist/commands/download/firefox.js"

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
  _brand_unofficial_patched=false
  _brand_official_patched=false
  _brand_shared_nsh_guard_patched=false
  _brand_base_copy_guard_patched=false
  _brand_nsis_fallback_patched=false
  _brand_update_url_guard_patched=false
  grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ?" "$AMELIA_BRANDING" && _brand_unofficial_patched=true
  grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'official')) ?" "$AMELIA_BRANDING" && _brand_official_patched=true
  grep -q "Skipping shared.nsh patch because" "$AMELIA_BRANDING" && _brand_shared_nsh_guard_patched=true
  grep -q "Skipping Mozilla base branding copy because" "$AMELIA_BRANDING" && _brand_base_copy_guard_patched=true
  grep -q "No base branding.nsi found in" "$AMELIA_BRANDING" && _brand_nsis_fallback_patched=true
  grep -q "Skipping update URL patch because" "$AMELIA_BRANDING" && _brand_update_url_guard_patched=true

  if { [ "$_brand_unofficial_patched" = "true" ] || [ "$_brand_official_patched" = "true" ]; } &&
    [ "$_brand_shared_nsh_guard_patched" = "true" ] &&
    [ "$_brand_base_copy_guard_patched" = "true" ] &&
    [ "$_brand_nsis_fallback_patched" = "true" ] &&
    [ "$_brand_update_url_guard_patched" = "true" ]; then
    echo "[patch-amelia] branding-patch.js guards already applied."
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

// Patch 3: tolerate Firefox source trees that do not ship official/unofficial
// branding folders by skipping the base copy and generating the few files we
// need from Midori's own branding config.
if (!content.includes('Skipping Mozilla base branding copy because')) {
  content = content.replace(
    "    const firefoxBrandingDirectoryContents = await (0, utils_1.walkDirectory)(BRANDING_FF);",
    `    const firefoxBrandingDirectoryContents = (0, node_fs_1.existsSync)(BRANDING_FF)
        ? await (0, utils_1.walkDirectory)(BRANDING_FF)
        : [];
    if (!(0, node_fs_1.existsSync)(BRANDING_FF)) {
        log_1.log.info('Skipping Mozilla base branding copy because ' + BRANDING_FF + ' does not exist in this source tree.');
    }`
  );
}

if (!content.includes('No base branding.nsi found in')) {
  const oldBrandingNsisBlock = `    const brandingNsis = files.filter((file) => file.includes(BRANDING_NSIS));
    console.assert(brandingNsis.length == 1, 'There should only be one branding.nsi file');
    const outputBrandingNsis = (0, node_path_1.join)(outputPath, brandingNsis[0].replace(BRANDING_FF, ''));
    const configureProfileBrandingPath = (0, node_path_1.join)(outputPath, 'pref', 'firefox-branding.js');
    log_1.log.debug('Configuring branding.nsi into ' + outputBrandingNsis);
    configureBrandingNsis(outputBrandingNsis, brandingConfig);`;
  const newBrandingNsisBlock = `    const brandingNsis = files.filter((file) => file.includes(BRANDING_NSIS));
    const outputBrandingNsis = brandingNsis.length == 1
        ? (0, node_path_1.join)(outputPath, brandingNsis[0].replace(BRANDING_FF, ''))
        : (0, node_path_1.join)(outputPath, BRANDING_NSIS);
    const configureProfileBrandingPath = (0, node_path_1.join)(outputPath, 'pref', 'firefox-branding.js');
    if (brandingNsis.length != 1) {
        log_1.log.info('No base branding.nsi found in ' + BRANDING_FF + '. Generating ' + outputBrandingNsis + ' from template.');
    }
    (0, utils_1.mkdirpSync)((0, node_path_1.dirname)(outputBrandingNsis));
    (0, utils_1.mkdirpSync)((0, node_path_1.dirname)(configureProfileBrandingPath));
    log_1.log.debug('Configuring branding.nsi into ' + outputBrandingNsis);
    configureBrandingNsis(outputBrandingNsis, brandingConfig);`;
  if (content.includes(oldBrandingNsisBlock)) {
    content = content.replace(oldBrandingNsisBlock, newBrandingNsisBlock);
  }
}

// Patch 4: guard shared.nsh mutation so Linux/macOS source trees can import
// branding without the Windows NSIS installer files being present.
if (!content.includes('Skipping shared.nsh patch because')) {
  content = content.replace(
    /\(0, node_fs_1\.writeFileSync\)\(SHARED_NSH, \(0, node_fs_1\.readFileSync\)\(SHARED_NSH\)\s*\.toString\(\)\s*\.replace\('"Publisher" "Mozilla"', `"Publisher" "\$\{brandingConfig\.brandingVendor\}"`\)\);/,
    `if ((0, node_fs_1.existsSync)(SHARED_NSH)) {
        (0, node_fs_1.writeFileSync)(SHARED_NSH, (0, node_fs_1.readFileSync)(SHARED_NSH)
            .toString()
            .replace('"Publisher" "Mozilla"', \`"Publisher" "\${brandingConfig.brandingVendor}"\`));
    }
    else {
        log_1.log.info('Skipping shared.nsh patch because ' + SHARED_NSH + ' does not exist in this source tree.');
    }`
  );
}

// Patch 5: tolerate source trees where application.ini.in is not present yet
// during import. The URL rewrite is not required for a build-only CI check.
if (!content.includes('Skipping update URL patch because')) {
  content = content.replace(
    /function setUpdateURLs\(\) \{\s*const baseURL = `URL=https:\/\/@MOZ_APPUPDATE_HOST@\/updates\/browser\/%BUILD_TARGET%\/%CHANNEL%\/update\.xml`;\s*const appIni = \(0, node_path_1\.join\)\(constants_1\.ENGINE_DIR, 'build', 'application\.ini\.in'\);\s*const appIniContents = \(0, node_fs_1\.readFileSync\)\(appIni\)\.toString\(\);\s*const updatedAppIni = appIniContents\.replace\(\/URL=\.\*update\.xml\/g, baseURL\);\s*\(0, node_fs_1\.writeFileSync\)\(appIni, updatedAppIni\);\s*\}/,
    `function setUpdateURLs() {
    const baseURL = \`URL=https://@MOZ_APPUPDATE_HOST@/updates/browser/%BUILD_TARGET%/%CHANNEL%/update.xml\`;
    const appIni = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'build', 'application.ini.in');
    if (!(0, node_fs_1.existsSync)(appIni)) {
        log_1.log.info('Skipping update URL patch because ' + appIni + ' does not exist in this source tree.');
        return;
    }
    const appIniContents = (0, node_fs_1.readFileSync)(appIni).toString();
    const updatedAppIni = appIniContents.replace(/URL=.*update.xml/g, baseURL);
    (0, node_fs_1.writeFileSync)(appIni, updatedAppIni);
}`
  );
}

fs.writeFileSync(file, content, 'utf8');
NODE

    if { grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'unofficial')) ?" "$AMELIA_BRANDING" ||
      grep -q "existsSync)((0, node_path_1.join)(BRANDING_STORE, 'official')) ?" "$AMELIA_BRANDING"; } &&
      grep -q "Skipping Mozilla base branding copy because" "$AMELIA_BRANDING" &&
      grep -q "No base branding.nsi found in" "$AMELIA_BRANDING" &&
      grep -q "Skipping shared.nsh patch because" "$AMELIA_BRANDING" &&
      grep -q "Skipping update URL patch because" "$AMELIA_BRANDING"; then
      echo "[patch-amelia] Patched branding-patch.js with branding fallbacks and missing-file guards."
    else
      echo "[patch-amelia] WARNING: Could not fully patch branding-patch.js guards."
    fi
  fi
fi

if [ -f "$AMELIA_COPY_PATCHES" ]; then
  if grep -q "const gitignorePath = (0, node_path_1.resolve)(constants_1.ENGINE_DIR, '.gitignore');" "$AMELIA_COPY_PATCHES"; then
    echo "[patch-amelia] copy-patches.js .gitignore guard already applied."
  else
    node <<'NODE'
const fs = require('node:fs');

const file = 'node_modules/@goastian/amelia/dist/commands/patches/copy-patches.js';
if (!fs.existsSync(file)) {
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

const oldGitignoreBlock = `    const gitignore = (0, node_fs_2.readFileSync)((0, node_path_1.resolve)(constants_1.ENGINE_DIR, '.gitignore')).toString();
    if (!gitignore.includes(getChunked(name).join('/')))
        (0, utils_1.appendToFileSync)((0, node_path_1.resolve)(constants_1.ENGINE_DIR, '.gitignore'), \`\\n\${getChunked(name).join('/')}\`);`;
const newGitignoreBlock = `    const gitignorePath = (0, node_path_1.resolve)(constants_1.ENGINE_DIR, '.gitignore');
    if (!(0, node_fs_1.existsSync)(gitignorePath)) {
        (0, node_fs_2.writeFileSync)(gitignorePath, '');
    }
    const gitignore = (0, node_fs_2.readFileSync)(gitignorePath).toString();
    if (!gitignore.includes(getChunked(name).join('/')))
        (0, utils_1.appendToFileSync)(gitignorePath, \`\\n\${getChunked(name).join('/')}\`);`;

if (content.includes(oldGitignoreBlock)) {
  content = content.replace(oldGitignoreBlock, newGitignoreBlock);
}

fs.writeFileSync(file, content, 'utf8');
NODE

    if grep -q "const gitignorePath = (0, node_path_1.resolve)(constants_1.ENGINE_DIR, '.gitignore');" "$AMELIA_COPY_PATCHES"; then
      echo "[patch-amelia] Patched copy-patches.js with .gitignore fallback."
    else
      echo "[patch-amelia] WARNING: Could not patch copy-patches.js .gitignore fallback."
    fi
  fi
fi

if [ -f "$AMELIA_DOWNLOAD_FIREFOX" ]; then
  if grep -q "Existing engine/ workspace is incomplete; removing it before downloading Firefox source." "$AMELIA_DOWNLOAD_FIREFOX"; then
    echo "[patch-amelia] download/firefox.js partial-engine guard already applied."
  else
    node <<'NODE'
const fs = require('node:fs');

const file = 'node_modules/@goastian/amelia/dist/commands/download/firefox.js';
if (!fs.existsSync(file)) {
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

const oldDownloadBlock = `    if (!(0, node_fs_1.existsSync)(constants_1.ENGINE_DIR)) {
        await setupFirefoxSource(version, candidateBuild, isCandidate);
    }`;
const newDownloadBlock = `    const needsFirefoxSource = shouldSetupFirefoxSource();
    if (needsFirefoxSource && (0, node_fs_1.existsSync)(constants_1.ENGINE_DIR)) {
        log_1.log.info('Existing engine/ workspace is incomplete; removing it before downloading Firefox source.');
        (0, node_fs_1.rmSync)(constants_1.ENGINE_DIR, { recursive: true, force: true });
    }
    if (needsFirefoxSource) {
        await setupFirefoxSource(version, candidateBuild, isCandidate);
    }`;

if (content.includes(oldDownloadBlock)) {
  content = content.replace(oldDownloadBlock, newDownloadBlock);
}

fs.writeFileSync(file, content, 'utf8');
NODE

    if grep -q "Existing engine/ workspace is incomplete; removing it before downloading Firefox source." "$AMELIA_DOWNLOAD_FIREFOX"; then
      echo "[patch-amelia] Patched download/firefox.js with partial-engine fallback."
    else
      echo "[patch-amelia] WARNING: Could not patch download/firefox.js partial-engine fallback."
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
