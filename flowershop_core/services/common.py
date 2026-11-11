from __future__ import annotations

import json
import re
from typing import Any

from ..db import Tx
from ..errors import NotFound, ValidationError

DEPARTMENTS = ("manager", "sales", "inventory", "production", "finance", "logistics")
_ACTOR_RE = re.compile(r"^(owner|owner\(chat\)|system|demo-seed|agent:(%s))$" % "|".join(DEPARTMENTS))


def norm_actor(actor: str | None) -> str:
    a = (actor or "owner").strip()
    if not _ACTOR_RE.match(a):
        raise ValidationError(f"Unknown actor {a!r}", field="actor")
    return a


def department_of(actor: str | None) -> str | None:
    if actor and actor.startswith("agent:"):
        return actor.split(":", 1)[1]
    return None


def req_str(data: dict, key: str, max_len: int = 500) -> str:
    v = data.get(key)
    if v is None or not str(v).strip():
        raise ValidationError(f"{key} is required", field=key)
    v = str(v).strip()
    if len(v) > max_len:
        raise ValidationError(f"{key} is too long (max {max_len})", field=key)
    return v


def opt_str(data: dict, key: str, max_len: int = 2000) -> str | None:
    v = data.get(key)
    if v is None:
        return None
    v = str(v).strip()
    if len(v) > max_len:
        raise ValidationError(f"{key} is too long (max {max_len})", field=key)
    return v or None


def opt_int(data: dict, key: str, default: int | None = None, minimum: int | None = None) -> int | None:
    v = data.get(key, default)
    if v is None or v == "":
        return default
    if isinstance(v, bool):
        raise ValidationError(f"{key} must be an integer", field=key)
    try:
        i = int(v)
        if float(v) != i:
            raise ValueError
    except (TypeError, ValueError):
        raise ValidationError(f"{key} must be an integer", field=key) from None
    if minimum is not None and i < minimum:
        raise ValidationError(f"{key} must be >= {minimum}", field=key)
    return i


def resolve_id(t: Tx, table: str, ref: Any, human_col: str | None = None, label: str = "record") -> int:
    """Accept an integer id, a numeric string, or the human-readable key."""
    if ref is None or ref == "":
        raise ValidationError(f"{label} id is required", field="id")
    if isinstance(ref, int) and not isinstance(ref, bool):
        row = t.one(f"SELECT id FROM {table} WHERE id = ?", (ref,))
    else:
        s = str(ref).strip()
        row = None
        if human_col:
            row = t.one(f"SELECT id FROM {table} WHERE {human_col} = ? COLLATE NOCASE", (s,))
        if row is None and s.isdigit():
            row = t.one(f"SELECT id FROM {table} WHERE id = ?", (int(s),))
        if row is None and table == "approvals":
            m = re.match(r"^AP-?0*(\d+)$", s, re.I)
            if m:
                row = t.one("SELECT id FROM approvals WHERE id = ?", (int(m.group(1)),))
    if row is None:
        raise NotFound(f"{label} {ref!r} not found", entity=label, ref=str(ref))
    return int(row["id"])


def dumps(v: Any) -> str:
    return json.dumps(v, default=str, ensure_ascii=False)
