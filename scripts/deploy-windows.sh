#!/usr/bin/env bash
# Dev helper: rebuild desktop/plugin.js and hot-deploy it to a Windows Hermes Desktop that
# runs in REMOTE mode (remote apps do not copy a package's desktop half themselves).
# Atomic staged swap + hash check, so the app's file watcher never sees a half-written file.
#
#   scripts/deploy-windows.sh user@host      # e.g. scripts/deploy-windows.sh me@windows-box
#
# The destination is resolved on the remote side from %LOCALAPPDATA%, so nothing here is
# machine-specific.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:?usage: scripts/deploy-windows.sh user@host}"
node scripts/build-desktop.mjs
node tests/desktop/load-gate.mjs | tail -1
H=$(sha256sum desktop/plugin.js | cut -d' ' -f1)
REL=$(ssh -o BatchMode=yes "$TARGET" \
  "powershell -NoProfile -Command \"[Environment]::ExpandEnvironmentVariables('%LOCALAPPDATA%')\"" | tr -d '\r')
DIR="${REL//\\//}/hermes/desktop-plugins/flower-shop"
ssh -o BatchMode=yes "$TARGET" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '$DIR' | Out-Null\""
scp -q desktop/plugin.js "$TARGET:$DIR/.plugin.staged.js"
ssh -o BatchMode=yes "$TARGET" "powershell -NoProfile -Command \"\$h=(Get-FileHash '$DIR/.plugin.staged.js' -Algorithm SHA256).Hash; if (\$h -ne '${H^^}') { Remove-Item '$DIR/.plugin.staged.js'; throw 'HASH MISMATCH - live file untouched' }; Move-Item '$DIR/.plugin.staged.js' '$DIR/plugin.js' -Force; 'deployed ' + \$h.Substring(0,12)\""
