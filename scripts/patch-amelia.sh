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
