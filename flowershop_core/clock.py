"""Time helpers. Store UTC ISO-8601 with ``Z``; display/business-day logic in the shop tz."""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .errors import ValidationError

UTC = timezone.utc


def now() -> datetime:
    # FLOWERSHOP_FAKE_NOW lets tests pin the clock (ISO string, UTC).
    fake = os.environ.get("FLOWERSHOP_FAKE_NOW")
    if fake:
        return parse(fake)
    return datetime.now(UTC).replace(microsecond=0)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_iso() -> str:
    return iso(now())


def tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "Asia/Jakarta")
    except (ZoneInfoNotFoundError, ValueError):
        raise ValidationError(f"Unknown timezone {name!r}", field="timezone") from None


def parse(value, default_tz: str | None = None) -> datetime:
    """Parse ISO-ish input. Naive values are interpreted in the business timezone."""
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value or "").strip()
        if not s:
            raise ValidationError("datetime is required", field="datetime")
        s = s.replace(" ", "T", 1) if "T" not in s and len(s) > 10 else s
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            raise ValidationError(f"Invalid datetime {value!r}; use ISO 8601 e.g. 2026-11-12T10:00", field="datetime") from None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz(default_tz))
    return dt.astimezone(UTC).replace(microsecond=0)


def parse_opt(value, default_tz: str | None = None) -> datetime | None:
    if value in (None, ""):
        return None
    return parse(value, default_tz)


def local_date(dt: datetime, tzname: str) -> date:
    return dt.astimezone(tz(tzname)).date()


def today(tzname: str) -> date:
    return local_date(now(), tzname)


def day_bounds_utc(d: date, tzname: str) -> tuple[str, str]:
    start = datetime(d.year, d.month, d.day, tzinfo=tz(tzname))
    end = start + timedelta(days=1)
    return iso(start), iso(end)


def parse_date(value, field: str = "date") -> date:
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValidationError(f"{field} must be YYYY-MM-DD", field=field) from None
