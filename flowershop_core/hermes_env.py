"""Best-effort, READ-ONLY view of the host Hermes install.

The plugin needs two facts to offer the bundled theme: where Hermes keeps its
skins, and which skin is active. Both are reads. Writing ``display.skin`` is
deliberately NOT done here — that belongs to Hermes' own ``config.set`` path
(the desktop card calls it), which also broadcasts ``skin.changed`` so every
surface repaints live. The plugin therefore never edits ``config.yaml``.

Import-guarded: outside Hermes (plain pytest, a CLI run) every value is
``None``, so callers degrade to "theme unavailable" instead of failing.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

# Test/debug override for the Hermes home, mirroring how FLOWERSHOP_DB_PATH
# relocates the store. Unset in normal use.
HOME_ENV = "FLOWERSHOP_HERMES_HOME"
SKIN_ENV = "FLOWERSHOP_ACTIVE_SKIN"


def home() -> Path | None:
    """The Hermes home directory, or ``None`` when there is no Hermes around."""
    override = os.environ.get(HOME_ENV)
    if override:
        return Path(override).expanduser()
    try:
        from hermes_constants import get_hermes_home  # type: ignore[import-not-found]
    except Exception:  # noqa: BLE001 - absent outside Hermes; not an error
        return None
    try:
        return Path(get_hermes_home()).expanduser()
    except Exception:  # noqa: BLE001
        log.debug("hermes home lookup failed", exc_info=True)
        return None


def skins_dir() -> Path | None:
    """``<hermes home>/skins`` — where a skin YAML has to live to be selectable."""
    base = home()
    return None if base is None else base / "skins"


def active_skin() -> str | None:
    """The configured ``display.skin``, or ``None`` when unreadable.

    Read-only: ``load_config_readonly`` never writes, and a failure is reported
    as "unknown" rather than guessed.
    """
    override = os.environ.get(SKIN_ENV)
    if override:
        return override.strip() or None
    try:
        from hermes_cli.config import load_config_readonly  # type: ignore[import-not-found]

        cfg = load_config_readonly()
    except Exception:  # noqa: BLE001
        log.debug("active skin lookup failed", exc_info=True)
        return None
    if not isinstance(cfg, dict):
        return None
    display = cfg.get("display")
    if not isinstance(display, dict):
        return None
    skin = display.get("skin")
    return skin.strip() if isinstance(skin, str) and skin.strip() else None


def skin_context() -> dict:
    """Both facts at once, in the shape the theme service takes."""
    return {"skins_dir": skins_dir(), "active_skin": active_skin()}
