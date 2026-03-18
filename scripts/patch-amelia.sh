#!/bin/bash
# Patch @goastian/amelia to fix multi-locale packaging bug.
# The getLocales() function splits supported-languages by '\n' but doesn't
# filter empty strings caused by trailing newlines, producing 'chrome-' target.

AMELIA_PKG="node_modules/@goastian/amelia/dist/commands/package.js"

if [ ! -f "$AMELIA_PKG" ]; then
  exit 0
fi

# Only patch if not already patched
if grep -q "filter(Boolean)" "$AMELIA_PKG"; then
  echo "[patch-amelia] Already patched."
  exit 0
fi

sed -i "s|return localesText.split('\\\\n');|return localesText.split('\\\\n').filter(Boolean);|" "$AMELIA_PKG"

if grep -q "filter(Boolean)" "$AMELIA_PKG"; then
  echo "[patch-amelia] Patched getLocales() to filter empty locale strings."
else
  echo "[patch-amelia] WARNING: Could not apply patch automatically."
fi
