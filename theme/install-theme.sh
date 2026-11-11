#!/usr/bin/env bash
# Install the bundled Anthousa garden skins into this machine's Hermes.
#
# Copies the skin files only. It does NOT switch your theme — a theme that changes
# itself on install is exactly the surprise the plugin avoids. Opt in explicitly:
#
#   ./install-theme.sh                            copy both skins, change nothing
#   ./install-theme.sh --activate                 copy both, then switch to anthousa
#   ./install-theme.sh --activate anthousa-night  copy both, then switch to the dusk twin
#
# The in-app path is better if you use Hermes Desktop: the onboarding "Theme" step
# offers the theme and one click applies it. THIS script is the terminal/CLI route.
#
# Roll back with ./restore-theme.sh, or: hermes config set display.skin claude-readability-dark
# Honours HERMES_HOME (falls back to ~/.hermes), so it also works per profile.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="${HERMES_HOME:-$HOME/.hermes}"
SKINS="$HERMES_DIR/skins"

THEME="anthousa"
ACTIVATE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --activate) ACTIVATE=1
                # an optional name may follow; a bare flag means the marble twin
                if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then THEME="$2"; shift; fi ;;
    --no-activate) ACTIVATE=0 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) THEME="$1" ;;
  esac
  shift
done

mkdir -p "$SKINS"
cp "$HERE/anthousa.yaml" "$HERE/anthousa-night.yaml" "$SKINS/"
echo "installed -> $SKINS/anthousa.yaml"
echo "installed -> $SKINS/anthousa-night.yaml"

if [ "$ACTIVATE" -eq 1 ]; then
  if [ ! -f "$SKINS/$THEME.yaml" ]; then
    echo "no such skin: $THEME (expected $SKINS/$THEME.yaml)" >&2
    exit 1
  fi
  hermes config set display.skin "$THEME"
  echo "active  -> $THEME"
else
  echo
  echo "Nothing switched. To use one:"
  echo "  hermes config set display.skin anthousa        # marble daylight"
  echo "  hermes config set display.skin anthousa-night  # aubergine dusk"
fi
