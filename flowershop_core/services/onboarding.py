"""Business onboarding (spec docs/ONBOARDING.md §4, §5) — pure domain logic.

Holds the 8-beat Welcome flow: business type, needs, fit, team, bots, custom
assessment, first result. Persists state on ``business_profile`` in the columns
added by migration 0003 (``needs``, ``fit``, ``bots``, ``custom_plugin``) and in
``onboarding_json.beats``. Pure domain — no Hermes imports.
"""
from __future__ import annotations

import json
from typing import Any

from ..db import Store, Tx, loads
from ..errors import ValidationError
from . import profile
from .common import DEPARTMENTS

# Canonical needs (beat 3) -> department (spec §4 mapping).
NEEDS = [
    "Orders & customers",
    "Stock & inventory",
    "Production & recipes",
    "Delivery",
    "Money & finance",
    "Something else",
]
NEED_DEPARTMENT = {
    "Orders & customers": "sales",
    "Stock & inventory": "inventory",
    "Production & recipes": "production",
    "Delivery": "logistics",
    "Money & finance": "finance",
    "Something else": None,  # flagged for the custom assessment
}

# The 8 beats, in order (spec §2).
BEATS = [
    {"id": "welcome", "title": "Welcome", "answer": None},
    {"id": "business", "title": "Business", "answer": None},
    {"id": "needs", "title": "Needs", "answer": None},
    {"id": "fit", "title": "Fit", "answer": None},
    {"id": "team", "title": "Team", "answer": None},
    {"id": "bots", "title": "Bots", "answer": None},
    {"id": "custom", "title": "Custom", "answer": None},
    {"id": "first_result", "title": "First result", "answer": None},
]
BEAT_IDS = [b["id"] for b in BEATS]

# Reasons offered to gate the fit for "Something else".
_CUSTOM_REASONS = [
    "Covers orders, inventory, production, delivery and finance for flower shops.",
    "An 'Other' business may use different workflows than those five primitives.",
]
_DEFAULT_DEPARTMENTS = ["sales", "inventory", "production", "finance", "logistics"]


# ---------------------------------------------------------------------------
# Pure recomputation helpers (no store)
# ---------------------------------------------------------------------------

def recommend_team(needs: list[str] | None) -> list[str]:
    """Departments implied by the owner's selected needs (spec §4)."""
    needs = needs or []
    deps: list[str] = []
    for n in needs:
        d = NEED_DEPARTMENT.get(n)
        if d and d not in deps:
            deps.append(d)
    return deps


def assess_fit(business_type: str | None, needs: list[str] | None) -> dict:
    """Deterministic fit: {covered, gaps, assessment} (spec §5, §9)."""
    needs = needs or []
    covered: list[str] = []
    gaps: list[str] = []
    for n in needs:
        if NEED_DEPARTMENT.get(n):  # a mapped primitive
            covered.append(n)
        else:  # "Something else" (or unknown) -> unmatched
            gaps.append(n)
    business_type = (business_type or "").strip().lower()
    if gaps:
        assessment = (
            "Flower Shop covers these: " + ", ".join(covered)
            if covered
            else "Flower Shop covers the standard flower-shop workflows."
        ) + " It doesn't cover: " + ", ".join(gaps) + "."
    else:
        assessment = "Flower Shop covers your business — you're set."
    return {"covered": covered, "gaps": gaps, "assessment": assessment}


def assess_custom(business_type: str | None, needs: list[str] | None, fit: dict | None) -> dict:
    """Whether a custom plugin is needed, and the offer (spec §9)."""
    fit = fit or assess_fit(business_type, needs)
    reasons = list(fit.get("gaps") or [])
    if any(n == "Something else" for n in (needs or [])):
        reasons.append(
            "You picked 'Something else' — we don't assume the primitives map for it."
        )
    needed = bool(reasons)
    if needed:
        offer = (
            "You can extend Flower Shop with a custom skill or plugin to cover: "
            + ", ".join(reasons)
            + ". Ask me to help build one."
        )
    else:
        offer = "You're set. No custom plugin needed."
    return {"needed": needed, "reasons": reasons, "offer": offer}


def recommend_bots(needs: list[str] | None, departments: list[str] | None) -> list[dict]:
    """Bot profile recommendation from needs+departments (spec §8)."""
    deps = [d for d in (departments or recommend_team(needs)) if d in _DEFAULT_DEPARTMENTS]
    if not deps:
        deps = list(_DEFAULT_DEPARTMENTS)
    return [
        {"name": n, "profile": f"flower-shop-{n}", "purpose": _purpose(n)} for n in deps
    ]


def _purpose(dept: str) -> str:
    return {
        "sales": "Turn enquiries into confirmed orders.",
        "inventory": "Keep stock accurate and reorder on time.",
        "production": "Plan and track bouquets through the workshop.",
        "finance": "Record money in, money out and margins.",
        "logistics": "Schedule and track deliveries.",
    }.get(dept, dept)


# ---------------------------------------------------------------------------
# Read / write via the store
# ---------------------------------------------------------------------------

def _beats(t: Tx) -> dict:
    ob = loads(profile._get_raw(t).get("onboarding_json"), {})
    return ob.get("beats", {}) if isinstance(ob, dict) else {}


def _save_beats(t: Tx, beats: dict) -> None:
    p = profile._get_raw(t)
    ob = loads(p.get("onboarding_json"), {})
    if not isinstance(ob, dict):
        ob = {}
    ob["beats"] = beats
    t.execute(
        "UPDATE business_profile SET onboarding_json = ?, updated_at = ? WHERE id = 1",
        (json.dumps(ob), t.now),
    )


def _set_column(t: Tx, column: str, value: Any) -> None:
    t.execute(
        f"UPDATE business_profile SET {column} = ?, updated_at = ? WHERE id = 1",
        (json.dumps(value, ensure_ascii=False), t.now),
    )


def state(s: Store) -> dict:
    """Full onboarding state (spec §5): profile + needs + fit + bots + custom + steps + beats."""
    t = s.read()
    p = profile._get_raw(t)
    beats = _beats(t)
    steps = []
    for b in BEATS:
        rec = beats.get(b["id"])
        steps.append({
            "id": b["id"], "title": b["title"],
            "done": bool(rec), "done_at": rec.get("done") if isinstance(rec, dict) else None,
            "answer": rec.get("answer") if isinstance(rec, dict) else None,
        })
    current = next((st["id"] for st in steps if not st["done"]), "first_result")
    return {
        "profile": profile._shape(t, p),
        "needs": loads(p.get("needs"), []),
        "fit": loads(p.get("fit"), {}),
        "bots": loads(p.get("bots"), []),
        "custom_plugin": loads(p.get("custom_plugin"), {}),
        "steps": steps,
        "beats": beats,
        "complete": all(st["done"] for st in steps),
        "current_step": current,
    }


def answer(s: Store, beat: str | None, answer_value: Any, actor: str = "owner") -> dict:
    """Validate + record one beat; advances and returns the next beat (spec §2, §5)."""
    beat = (beat or "").strip()
    if beat not in BEAT_IDS:
        raise ValidationError(f"Unknown onboarding beat {beat!r}. Valid beats: {', '.join(BEAT_IDS)}",
                              field="beat")
    with s.tx() as t:
        profile._ensure(t)
        beats = _beats(t)
        beats[beat] = {"done": t.now, "answer": answer_value}
        _save_beats(t, beats)
        # Drive the computed columns as beats complete.
        if beat == "needs":
            needs = answer_value if isinstance(answer_value, list) else []
            for n in needs:
                if n not in NEEDS:
                    raise ValidationError(f"Unknown need {n!r}. Valid: {', '.join(NEEDS)}", field="answer")
            _set_column(t, "needs", needs)
        if beat == "team" and isinstance(answer_value, list):
            _valid_departments(answer_value)
            _set_column(t, "enabled_departments",
                        [d for d in answer_value if d in _DEFAULT_DEPARTMENTS])
        if beat == "bots" and isinstance(answer_value, list):
            for bot in answer_value:
                if not isinstance(bot, dict) or "name" not in bot or "profile" not in bot:
                    raise ValidationError("Each bot must have name and profile", field="answer")
            _set_column(t, "bots", answer_value)
        if beat == "custom" and isinstance(answer_value, dict):
            _set_column(t, "custom_plugin", answer_value)
        t.audit("onboarding", None, f"beat_answered:{beat}", actor)
    return state(s)


def _valid_departments(deps: list[str]) -> None:
    for d in deps:
        if d not in DEPARTMENTS:
            raise ValidationError(f"Unknown department {d!r}. Valid: {', '.join(DEPARTMENTS)}",
                                  field="answer")


def complete(s: Store, actor: str = "owner") -> dict:
    """Mark every beat done and update onboarding_complete (spec §2 beat 8)."""
    with s.tx() as t:
        profile._ensure(t)
        beats = _beats(t)
        for b in BEAT_IDS:
            rec = beats.get(b) or {}
            if not rec.get("done"):
                beats[b] = {"done": t.now, "answer": rec.get("answer")}
        _save_beats(t, beats)
        t.audit("onboarding", None, "completed", actor)
    st = state(s)
    return {"complete": st["complete"], "next": None if st["complete"] else st["current_step"], "state": st}
