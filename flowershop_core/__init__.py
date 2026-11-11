"""Flower Shop domain core.

The ONLY layer that touches SQL. Agent tools (``flowershop_core.tools``) and the desktop
REST API (``dashboard/plugin_api.py``) are thin adapters over ``flowershop_core.services``.
Standard library only, Python >= 3.11.
"""
from __future__ import annotations

__version__ = "0.1.0"
PLUGIN_ID = "flower-shop"

from .db import Store, get_store  # noqa: E402,F401
from .errors import FlowerShopError  # noqa: E402,F401
