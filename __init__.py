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
from flowershop_core.services import approvals as _approvals  # noqa: E402
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


def _approval_gate(tool_name: str, args: dict | None = None, **kwargs) -> dict | None:
    """Escalate ``flowershop_decide_approval`` to Hermes' own human-approval gate.

    The chat relay is a convenience; the decision itself must still land in front
    of the owner (\"agents propose, owner approves\"). Returning
    ``{\"action\": \"approve\", \"message\": ...}`` makes Hermes show the owner a
    confirmation before the tool runs. Fails closed: if the approval cannot be
    read, we STILL request approval with a generic message. Never raises.
    """
    try:
        if tool_name != "flowershop_decide_approval":
            return None
        args = dict(args or {})
        approval_id = args.get("approval_id")
        decision = str(args.get("decision") or "approve").lower()
        message = f"Flower Shop: {decision.upper()} approval #{approval_id}. Owner, confirm?"
        try:
            a = _approvals.get(get_store(), approval_id)
            if a:
                message = (f"Flower Shop: {decision.upper()} approval #{approval_id} \u2014 "
                           f"{a.get('action', '')}: {str(a.get('summary') or '').strip()} "
                           f"Owner, confirm?")
        except Exception:  # noqa: BLE001 - fail closed with the generic message
            log.exception("approval gate could not read approval %r; escalating generically",
                          approval_id)
        return {"action": "approve", "message": message,
                "rule_key": "flower-shop-decide-approval"}
    except Exception:  # noqa: BLE001 - a hook must never raise
        log.exception("approval gate failed; escalating generically")
        return {"action": "approve",
                "message": "Flower Shop: an owner approval is required before deciding this."}


def register(ctx) -> None:
    """Wire tools, skills, settings and the slash command into the Hermes registry."""
    # ---- settings ------------------------------------------------------------------
    _handlers.CHAT_APPROVALS = _settings_flag(ctx, "chat_approvals", default=False)

    # ---- approval gate hook --------------------------------------------------------
    # Escalate flowershop_decide_approval to Hermes' human-approval gate so no agent
    # can decide an approval without a human confirm, even when chat relay is on.
    register_hook = getattr(ctx, "register_hook", None)
    if register_hook is not None:
        try:
            register_hook("pre_tool_call", _approval_gate)
        except Exception:  # noqa: BLE001 - one failure must not disable the plugin
            log.exception("failed to register pre_tool_call hook")

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