"""Flower Shop — an AI business workspace for a flower shop.

Hermes adapter layer. Registers:

* ~30 agent tools (toolset ``flower_shop``) forwarding to ``flowershop_core.services``,
* the department skills under ``skills/*/SKILL.md`` as ``flower-shop:<dir>``,
* the ``/flowershop`` slash command printing a short plain-text briefing.

The core (``flowershop_core``) is stdlib-only and never imports Hermes; only this
``register`` and ``dashboard/plugin_api.py`` touch the context. Every registration is
wrapped so a single failure cannot disable the whole plugin.

Hermes loads this file by path (``importlib.spec_from_file_location``), so the repo root
is placed on sys.path if absent before importing ``flowershop_core`` — matching the
strategy used by ``dashboard/plugin_api.py`` so both share ONE module instance.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from flowershop_core import get_store  # noqa: E402
from flowershop_core.events import install_hermes_broadcaster  # noqa: E402
from flowershop_core.services import insights  # noqa: E402
import flowershop_core.tools as tools  # noqa: E402
from flowershop_core.tools import handlers as _handlers  # noqa: E402

log = logging.getLogger(__name__)

install_hermes_broadcaster("flower-shop")  # safe no-op outside Hermes


def _settings_flag(ctx, key: str, default: bool) -> bool:
    """Read a plugin setting defensively (get_config may be missing on some futures)."""
    get_config = getattr(ctx, "get_config", None)
    if get_config is None:
        return default
    try:
        return bool(get_config(key, default=default))
    except Exception:  # noqa: BLE001
        log.exception("could not read plugin setting %r", key)
        return default


def _briefing_text() -> str:
    """Short plain-text daily briefing for the /flowershop command."""
    try:
        o = insights.overview(get_store())
    except Exception as exc:  # noqa: BLE001
        return f"Flower Shop briefing unavailable: {exc}"
    m = o["metrics"]
    lines = [
        f"{o.get('business_name') or 'Flower Shop'} — {o['today']} ({o['timezone']})",
        f"- {m['orders_due_today']} due today · {m['late_orders']} late · "
        f"{m['in_production']} in production · {m['ready']} ready",
        f"- {m['pending_approvals']} pending approval(s) · {m['low_stock_items']} low-stock item(s)",
    ]
    for a in o["alerts"]:
        lines.append(f"- {a['severity'].upper()}: {a['title']} — {a['detail']}")
    if o["pending_approvals"]:
        lines.append("- Approvals: " + "; ".join(
            f"{a['ref']} {a['action']} ({a['summary']})" for a in o["pending_approvals"][:5]))
    if o["due_today"]:
        lines.append("- Due today: " + "; ".join(
            f"{x['order_number']} ({x['customer']['name'] if x['customer'] else 'no customer'})"
            for x in o["due_today"][:5]))
    lines.append("::flowershop-briefing{}")  # desktop renders a live card
    return "\n".join(lines)


def _command_flowershop(raw_args: str, **kwargs) -> str:
    return _briefing_text()


def register(ctx) -> None:
    """Wire tools, skills, settings and the slash command into the Hermes registry."""
    # ---- settings ------------------------------------------------------------------
    _handlers.CHAT_APPROVALS = _settings_flag(ctx, "chat_approvals", default=True)

    # ---- tools ---------------------------------------------------------------------
    registered = 0
    for name, schema, handler in tools.TOOLS:
        try:
            ctx.register_tool(name=name, toolset="flower_shop", schema=schema, handler=handler)
            registered += 1
        except Exception:  # noqa: BLE001 - one failure must not disable the plugin
            log.exception("failed to register tool %s", name)
    log.info("flower-shop registered %d/%d tools", registered, len(tools.TOOLS))

    # ---- skills --------------------------------------------------------------------
    skills_dir = _REPO_ROOT / "skills"
    if skills_dir.is_dir():
        for child in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
            try:
                md = child / "SKILL.md"
                if md.is_file():
                    ctx.register_skill(child.name, md)
            except Exception:  # noqa: BLE001
                log.exception("failed to register skill %s", child.name)

    # ---- slash command --------------------------------------------------------------
    register_command = getattr(ctx, "register_command", None)
    if register_command is not None:
        try:
            register_command("flowershop", _command_flowershop,
                             description="Flower Shop: today's briefing")
        except Exception:  # noqa: BLE001
            log.exception("failed to register /flowershop command")


# Re-export for introspection / plugin doctor.
from flowershop_core import __version__  # noqa: E402,F401
from flowershop_core import PLUGIN_ID  # noqa: E402,F401

__all__ = ["register", "PLUGIN_ID", "__version__", "TOOLS"]
TOOLS = tools.TOOLS