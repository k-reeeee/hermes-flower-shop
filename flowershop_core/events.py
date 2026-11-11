"""Post-commit change notifications. The Hermes adapters install a broadcaster that
forwards to ``hermes_cli.plugin_events.broadcast_plugin_event`` so the Desktop half
refreshes live. Core stays importable (and testable) without Hermes."""
from __future__ import annotations

import logging
from typing import Callable

log = logging.getLogger(__name__)
_broadcasters: list[Callable[[dict], None]] = []


def add_broadcaster(fn: Callable[[dict], None]) -> None:
    if fn not in _broadcasters:
        _broadcasters.append(fn)


def clear_broadcasters() -> None:
    _broadcasters.clear()


def emit(events: list[dict]) -> None:
    seen = set()
    for ev in events:
        key = (ev.get("entity_type"), ev.get("entity_id"), ev.get("action"))
        if key in seen:
            continue
        seen.add(key)
        for fn in list(_broadcasters):
            try:
                fn(ev)
            except Exception:  # a broken listener must never break a committed write
                log.debug("flower-shop broadcaster failed", exc_info=True)


def install_hermes_broadcaster(plugin_id: str = "flower-shop") -> bool:
    try:
        from hermes_cli.plugin_events import broadcast_plugin_event
    except Exception:
        return False

    def _send(ev: dict) -> None:
        broadcast_plugin_event(plugin_id, "changed", ev)

    _send.__name__ = "hermes_broadcast"
    if not any(getattr(f, "__name__", "") == "hermes_broadcast" for f in _broadcasters):
        add_broadcaster(_send)
    return True
