#!/bin/bash

set -e

# Patch @goastian/amelia to fix:
# 1) multi-locale packaging bug from trailing empty lines
# 2) addon download flow issues in CI:
#    - git identity requirement during addon initialization
#    - hard failure when browser/extensions/moz.build is not present

AMELIA_PKG="node_modules/@goastian/amelia/dist/commands/package.js"
AMELIA_ADDON="node_modules/@goastian/amelia/dist/commands/download/addon.js"

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

if [ -f "$AMELIA_ADDON" ]; then
  if grep -q "Initializing addon... (skip git commit)" "$AMELIA_ADDON"; then
    echo "[patch-amelia] addon.js CI fixes already applied."
  else
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

const mozbuildSnippet = "    await (0, discard_1.discard)('browser/extensions/moz.build');\n    const path = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'browser', 'extensions', 'moz.build');";
const mozbuildReplacement = "    const mozbuildPath = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'browser', 'extensions', 'moz.build');\n    const appMozbuildPath = (0, node_path_1.join)(constants_1.ENGINE_DIR, 'browser', 'extensions', 'app.mozbuild');\n    const path = (0, node_fs_1.existsSync)(mozbuildPath) ? mozbuildPath : appMozbuildPath;\n    if ((0, node_fs_1.existsSync)(mozbuildPath)) {\n        await (0, discard_1.discard)('browser/extensions/moz.build');\n    }";
if (content.includes(mozbuildSnippet) && !content.includes('appMozbuildPath')) {
  content = content.replace(mozbuildSnippet, mozbuildReplacement);
}

fs.writeFileSync(file, content, 'utf8');
NODE

    if grep -q "Initializing addon... (skip git commit)" "$AMELIA_ADDON" && grep -q "app.mozbuild" "$AMELIA_ADDON"; then
      echo "[patch-amelia] Patched addon.js for CI-safe addon initialization and mozbuild fallback."
    else
      echo "[patch-amelia] WARNING: Could not fully patch addon.js."
    fi
  fi
fi
