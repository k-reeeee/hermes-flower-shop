"""Shared pytest fixtures.

Every test gets a fresh SQLite database under a tmp path (via
``FLOWERSHOP_DB_PATH``), independent of the user's live ~/.hermes data. The FastAPI
app is built the same way the tests exercise it: ``FastAPI()`` + the plugin router.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Make the repo root importable (flowershop_core, dashboard.plugin_api, plugin __init__).
_REPO = Path(__file__).resolve().parent.parent
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from flowershop_core import events  # noqa: E402
from flowershop_core.db import get_store  # noqa: E402


@pytest.fixture
def db_path(tmp_path):
    """Point the store at a fresh db for this test and clear broadcasters."""
    path = tmp_path / "shop.db"
    os.environ["FLOWERSHOP_DB_PATH"] = str(path)
    events.clear_broadcasters()
    yield path
    # Leave FLOWERSHOP_DB_PATH pointing at a now-deleted file so later tests are
    # always isolated; the fixture sets it again for each test anyway.


@pytest.fixture
def store(db_path):
    return get_store()


@pytest.fixture
def app(store):
    from fastapi import FastAPI
    from dashboard.plugin_api import router

    application = FastAPI()
    application.include_router(router, prefix="/api/plugins/flower-shop")
    return application


@pytest.fixture
def client(app):
    from fastapi.testclient import TestClient

    return TestClient(app)