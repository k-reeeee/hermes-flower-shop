"""The bundled garden theme ("Anthousa") — offered in onboarding, never applied on its own.

The plugin ships the skin YAMLs in ``theme/`` at the repo root. This service does two
things and no more:

1. **Prepares** them: copies the YAML into the Hermes skins directory the caller
   names, so Hermes can select them. Idempotent — an unchanged file is left alone.
2. **Records** the owner's choice (``apply`` / ``keep``) and the skin that was active
   beforehand, so the switch is one click to undo.

It deliberately does NOT write ``display.skin``. That is Hermes' own
``config.set {key: "skin"}`` path, which writes the config value and broadcasts
``skin.changed`` so every surface repaints live. A theme that changed itself on
install is exactly the surprise this design exists to prevent (docs/ONBOARDING.md §2,
beat 8).

Pure domain: no Hermes imports. The caller passes the skins directory and the active
skin in (see ``flowershop_core.hermes_env``).
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

from ..db import Store, Tx, loads
from ..errors import ValidationError
from . import onboarding, profile

# The skins this plugin ships. `file` resolves inside the repo's theme/ directory.
BUNDLED: list[dict[str, str]] = [
    {
        "name": "anthousa",
        "title": "Anthousa",
        "tone": "Marble daylight",
        "polarity": "light",
        "description": "Ancient Greek garden — blush marble, rose-gold and laurel",
        "file": "anthousa.yaml",
    },
    {
        "name": "anthousa-night",
        "title": "Anthousa Night",
        "tone": "Aubergine dusk",
        "polarity": "dark",
        "description": "Ancient Greek garden at dusk — aubergine night, rose-gold and moonlight",
        "file": "anthousa-night.yaml",
    },
]
NAMES: list[str] = [t["name"] for t in BUNDLED]
CHOICES = ("apply", "keep")

_NAME_RE = re.compile(r"^name:\s*(\S+)\s*$", re.MULTILINE)


# ---------------------------------------------------------------------------
# Where the shipped files live
# ---------------------------------------------------------------------------

def plugin_root() -> Path:
    """The plugin repo root (…/flowershop_core/services/theme.py -> repo root)."""
    return Path(__file__).resolve().parents[2]


def theme_dir(root: Path | None = None) -> Path:
    """The directory holding the shipped skin YAMLs."""
    return Path(root or plugin_root()) / "theme"


def bundled() -> list[dict[str, str]]:
    """The shipped themes, as a fresh list (callers may not mutate the catalog)."""
    return [dict(t) for t in BUNDLED]


def _spec(name: str | None) -> dict[str, str]:
    key = (name or "").strip()
    for t in BUNDLED:
        if t["name"] == key:
            return t
    raise ValidationError(f"Unknown theme {key!r}. Bundled themes: {', '.join(NAMES)}", field="theme")


def _source(name: str, root: Path | None = None) -> Path:
    """The shipped YAML for ``name``, sanity-checked before it is copied anywhere.

    The check is cheap on purpose — read the file's own ``name:`` line and make sure
    it agrees with the catalog, so a renamed or half-written file is caught here
    rather than surfacing as a skin that silently falls back to the default.
    """
    spec = _spec(name)
    path = theme_dir(root) / spec["file"]
    if not path.is_file():
        raise ValidationError(f"The bundled theme file is missing: {path}", field="theme")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:  # unreadable file on disk
        raise ValidationError(f"Could not read {path}: {e}", field="theme") from e
    found = _NAME_RE.search(text)
    if not found or found.group(1) != spec["name"]:
        raise ValidationError(
            f"{spec['file']} does not declare name: {spec['name']} (found {found.group(1) if found else None!r})",
            field="theme",
        )
    return path


# ---------------------------------------------------------------------------
# Filesystem: prepare the skins (never activates)
# ---------------------------------------------------------------------------

def installed_names(skins_dir: Path | None) -> list[str]:
    """Which bundled skins are already present in the Hermes skins directory."""
    if skins_dir is None:
        return []
    out = [t["name"] for t in BUNDLED if (Path(skins_dir) / t["file"]).is_file()]
    return sorted(out)


def install(skins_dir: Path | None, names: list[str] | None = None,
            root: Path | None = None) -> dict:
    """Copy the shipped YAMLs into the Hermes skins directory. Idempotent.

    Returns ``{skins_dir, copied, unchanged}``. Nothing is written outside that
    directory, and an unchanged file is not rewritten (so a hand-edited local copy
    survives an install).
    """
    if skins_dir is None:
        raise ValidationError(
            "No Hermes skins directory found, so the theme cannot be installed. "
            "Copy theme/anthousa.yaml into your skins directory by hand instead.",
            field="theme",
        )
    target_dir = Path(skins_dir)
    wanted = list(names) if names else NAMES
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise ValidationError(f"Could not create {target_dir}: {e}", field="theme") from e

    copied: list[str] = []
    unchanged: list[str] = []
    for name in wanted:
        spec = _spec(name)
        src = _source(name, root)
        dst = target_dir / spec["file"]
        try:
            if dst.is_file() and dst.read_bytes() == src.read_bytes():
                unchanged.append(spec["name"])
                continue
            shutil.copyfile(src, dst)
        except OSError as e:
            raise ValidationError(f"Could not write {dst}: {e}", field="theme") from e
        copied.append(spec["name"])
    return {"skins_dir": str(target_dir), "copied": copied, "unchanged": unchanged}


# ---------------------------------------------------------------------------
# The recorded choice (stored on onboarding_json, no migration needed)
# ---------------------------------------------------------------------------

def _obj(t: Tx) -> dict:
    raw = loads(profile._get_raw(t).get("onboarding_json"), {})
    theme = raw.get("theme") if isinstance(raw, dict) else None
    return theme if isinstance(theme, dict) else {}


def _save_obj(t: Tx, value: dict) -> None:
    import json

    p = profile._get_raw(t)
    raw = loads(p.get("onboarding_json"), {})
    if not isinstance(raw, dict):
        raw = {}
    raw["theme"] = value
    t.execute("UPDATE business_profile SET onboarding_json = ?, updated_at = ? WHERE id = 1",
              (json.dumps(raw), t.now))


def _previous_for(active_skin: str | None, recorded: dict) -> str | None:
    """The skin an undo should go back to.

    Picking the dusk twin while the day twin is already on must NOT make the day
    twin the thing to undo — the original theme is what the owner started from.
    """
    if active_skin in NAMES:
        return (recorded.get("previous_skin") or None)
    return active_skin or None


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def state(s: Store, skins_dir: Path | None = None, active_skin: str | None = None) -> dict:
    """Everything the card and the agent need to describe the offer honestly."""
    t = s.read()
    recorded = _obj(t)
    active = active_skin or None
    installed = installed_names(skins_dir)
    return {
        "available": skins_dir is not None,
        "skins_dir": str(skins_dir) if skins_dir is not None else None,
        "bundled": bundled(),
        "installed": installed,
        "missing": [n for n in NAMES if n not in installed],
        "active": active,
        "previous": _previous_for(active, recorded) if active in NAMES else None,
        "choice": recorded or None,
    }


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def apply_choice(s: Store, body: dict | None, skins_dir: Path | None = None,
                 active_skin: str | None = None, actor: str = "owner") -> dict:
    """Record the owner's answer to the theme beat; install on ``apply``.

    Never activates: the reply carries ``activate`` (a skin name or None) and the
    caller performs the switch through Hermes' own ``config.set``.
    """
    body = body or {}
    choice = str(body.get("choice") or "").strip().lower()
    if choice not in CHOICES:
        raise ValidationError(f"choice must be one of {CHOICES}", field="choice")

    names: list[str] = []
    activate: str | None = None
    if choice == "apply":
        spec = _spec(body.get("theme"))
        names = [spec["name"]]
        activate = spec["name"]

    installed = install(skins_dir, names) if names else {"copied": [], "unchanged": [], "skins_dir": None}

    with s.tx() as t:
        profile._ensure(t)
        recorded = _obj(t)
        record = {
            "choice": choice,
            "theme": activate,
            "previous_skin": _previous_for(active_skin, recorded) if activate else None,
            "installed": installed.get("copied", []) + installed.get("unchanged", []),
            "at": t.now,
        }
        _save_obj(t, record)
        onboarding.record_beat(t, "theme", record)
        t.audit("onboarding", None, f"theme_{choice}" + (f":{activate}" if activate else ""), actor)

    return {
        "activate": activate,
        "choice": record,
        "copied": installed.get("copied", []),
        "unchanged": installed.get("unchanged", []),
        "state": state(s, skins_dir=skins_dir, active_skin=activate or active_skin),
    }


def revert(s: Store, skins_dir: Path | None = None, active_skin: str | None = None,
           actor: str = "owner") -> dict:
    """Undo an applied theme: hand back the skin to switch to.

    Like ``apply_choice`` this only reports the target — the caller performs the
    switch. The undone record keeps its history but loses ``previous_skin`` so the
    undo affordance disappears once it has been used.
    """
    with s.tx() as t:
        recorded = _obj(t)
        # The undo target is the skin recorded BEFORE an apply — never whatever is
        # active now, or a bare revert would "undo" a theme that was never changed.
        target = recorded.get("previous_skin") or None
        if not target:
            raise ValidationError(
                "No earlier theme was recorded, so there is nothing to undo. "
                "Set display.skin in Hermes directly, or ask for a theme first.",
                field="previous_skin",
            )
        if target in NAMES and target not in installed_names(skins_dir):
            install(skins_dir, [target])
        t.execute("UPDATE business_profile SET updated_at = ? WHERE id = 1", (t.now,))
        _save_obj(t, {**recorded, "previous_skin": None, "reverted_to": target, "reverted_at": t.now})
        t.audit("onboarding", None, f"theme_reverted:{target}", actor)
    return {"revert_to": target}


def reset(s: Store) -> None:
    """Drop the recorded theme choice (used when onboarding is replayed)."""
    with s.tx() as t:
        profile._ensure(t)
        _save_obj(t, {})
