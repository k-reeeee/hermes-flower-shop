"""Money is always an integer count of minor units (``*_minor``) plus an ISO-4217 code.
Never floats. Quantities are integer *milli-units* internally (``*_milli``)."""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal

ZERO_EXPONENT = {"IDR", "JPY", "KRW", "VND", "CLP", "ISK"}
SUPPORTED_CURRENCIES = ("IDR", "USD", "SGD", "EUR", "MYR", "AUD", "GBP", "JPY")
# Units that are physically counted: requirements round UP to whole units.
COUNT_UNITS = {"stem", "piece", "pcs", "sheet", "card", "vase", "bunch", "box", "pot"}


def exponent(currency: str) -> int:
    return 0 if (currency or "").upper() in ZERO_EXPONENT else 2


def to_minor(value, field: str = "amount") -> int:
    """Accept an int (already minor units) or numeric string/Decimal minor units."""
    from .errors import ValidationError

    if isinstance(value, bool) or value is None:
        raise ValidationError(f"{field} is required", field=field)
    try:
        d = Decimal(str(value))
    except Exception:
        raise ValidationError(f"{field} must be a number", field=field) from None
    if d != d.to_integral_value():
        raise ValidationError(f"{field} must be whole minor units (integer)", field=field)
    return int(d)


def format_money(minor: int, currency: str) -> str:
    cur = (currency or "IDR").upper()
    if cur == "IDR":
        sign = "-" if minor < 0 else ""
        return f"{sign}Rp{abs(int(minor)):,}".replace(",", ".")
    exp = exponent(cur)
    major = Decimal(int(minor)) / (Decimal(10) ** exp)
    return f"{cur} {major:,.{exp}f}"


# ---- quantities -------------------------------------------------------------------------

def qty_to_milli(value, field: str = "quantity", allow_zero: bool = False, allow_negative: bool = False) -> int:
    from .errors import ValidationError

    if isinstance(value, bool) or value is None or value == "":
        raise ValidationError(f"{field} is required", field=field)
    try:
        d = Decimal(str(value))
    except Exception:
        raise ValidationError(f"{field} must be a number", field=field) from None
    if not d.is_finite():
        raise ValidationError(f"{field} must be finite", field=field)
    milli = int((d * 1000).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    if milli < 0 and not allow_negative:
        raise ValidationError(f"{field} must not be negative", field=field)
    if milli == 0 and not allow_zero:
        raise ValidationError(f"{field} must not be zero", field=field)
    return milli


def milli_to_qty(milli: int):
    """Integer when whole, else a 3-decimal float for JSON."""
    if milli is None:
        return None
    if milli % 1000 == 0:
        return milli // 1000
    return round(milli / 1000.0, 3)


def requirement_milli(per_unit_milli: int, units: int, wastage_bp: int, unit: str) -> int:
    """quantity_per_unit x units x (1 + wastage), rounded up; whole units for counted goods."""
    raw = per_unit_milli * units * (10000 + max(0, wastage_bp))
    milli = -(-raw // 10000)  # ceil division
    if (unit or "").lower() in COUNT_UNITS:
        milli = int(math.ceil(milli / 1000.0)) * 1000
    return milli


def cost_of(milli: int, unit_cost_minor: int) -> int:
    """Cost of ``milli`` quantity at ``unit_cost_minor`` per unit, half-up rounded."""
    return int((Decimal(milli) * Decimal(unit_cost_minor) / 1000).quantize(Decimal(1), rounding=ROUND_HALF_UP))
