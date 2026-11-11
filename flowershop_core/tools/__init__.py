"""Agent tools for the Flower Shop plugin.

Thin adapter layer between Hermes tool calls and ``flowershop_core.services``.
The plugin's ``__init__.py::register`` imports :data:`TOOLS` and registers each
``(name, schema, handler)`` into the shared ``flower_shop`` toolset.

Every tool returns a JSON string and never raises (see ``handlers.py``).
"""
from __future__ import annotations

from . import handlers, schemas
from .handlers import CHAT_APPROVALS  # re-export for register() to toggle  # noqa: F401
from .schemas import (  # noqa: F401
    APPROVAL_GATED,
    DEFAULT_DEPARTMENTS,
    SCHEMAS,
    TOOL_NAMES,
)

__all__ = ["TOOLS", "SCHEMAS", "HANDLERS", "TOOL_NAMES", "APPROVAL_GATED", "CHAT_APPROVALS"]

# (name, schema, handler) tuples in API.md's canonical order.
TOOLS: list[tuple[str, dict, object]] = [
    (name, schemas.SCHEMAS[name], handlers.HANDLERS[name])
    for name in TOOL_NAMES
]

HANDLERS = handlers.HANDLERS