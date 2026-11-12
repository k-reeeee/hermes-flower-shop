#!/usr/bin/env bash
# Put this machine back on the theme that was active before the garden test.
# Restores the backed-up skin files first, so it still works after later edits.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="${HERMES_HOME:-$HOME/.hermes}"
SKINS="$HERMES_DIR/skins"
BACKUP="$HERE/backup"

if [ -f "$BACKUP/active-skin.txt" ]; then
  TARGET="$(tr -d '[:space:]' < "$BACKUP/active-skin.txt")"
else
  echo "note: no $BACKUP here (backups live outside the repo) — restoring active skin only" >&2
  TARGET="claude-readability-dark"
fi

mkdir -p "$SKINS"
for f in "$BACKUP"/*.yaml; do
  [ -e "$f" ] || continue
  cp "$f" "$SKINS/"
  echo "restored -> $SKINS/$(basename "$f")"
done

hermes config set display.skin "$TARGET"
echo "active   -> $TARGET"
