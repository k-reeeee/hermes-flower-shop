"""Onboarding REST integration tests (spec ONBOARDING §5)."""
from __future__ import annotations

import json

from flowershop_core.services import onboarding

PREFIX = "/api/plugins/flower-shop"


def _pc(client, path, **kw):
    return client.post(PREFIX + path, json=kw or {})


def _get(client, path):
    return client.get(PREFIX + path)


def test_get_onboarding_state(store, client):
    r = _get(client, "/onboarding")
    assert r.status_code == 200
    body = r.json()
    assert "profile" in body
    assert "needs" in body and "fit" in body and "bots" in body and "custom_plugin" in body
    assert "steps" in body and "beats" in body and "complete" in body and "current_step" in body
    assert body["complete"] is False
    assert len(body["steps"]) == 8


def test_answer_onboarding_beat(store, client):
    r = _pc(client, "/onboarding/beat", beat="needs", answer=["Orders & customers", "Delivery"])
    assert r.status_code == 200
    body = r.json()
    assert body["needs"] == ["Orders & customers", "Delivery"]
    # persisted, readable back
    r2 = _get(client, "/onboarding")
    assert r2.json()["needs"] == ["Orders & customers", "Delivery"]


def test_answer_unknown_beat_errors(store, client):
    r = _pc(client, "/onboarding/beat", beat="bogus", answer="x")
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "validation_error"


def test_fit_endpoint(store, client):
    _pc(client, "/onboarding/beat", beat="needs", answer=["Orders & customers"])
    r = _get(client, "/onboarding/fit")
    assert r.status_code == 200
    body = r.json()
    assert body["business_type"] == "florist"
    assert "fit" in body and "custom_plugin" in body
    assert body["fit"]["covered"] == ["Orders & customers"]
    assert body["fit"]["gaps"] == []


def test_complete_onboarding(store, client):
    r = _pc(client, "/onboarding/complete")
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is True
    # unconditional: profile.onboarding reports complete too
    assert onboarding.state(store)["complete"] is True


def test_reset_onboarding_endpoint(store, client):
    _pc(client, "/onboarding/beat", beat="needs", answer=["Orders & customers"])
    _pc(client, "/onboarding/complete")
    assert _get(client, "/onboarding").json()["complete"] is True
    r = _pc(client, "/onboarding/reset")
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is False
    assert body["needs"] == [] and body["bots"] == [] and body["fit"] == {}
    assert body["current_step"] == "welcome"
    # persisted
    assert _get(client, "/onboarding").json()["complete"] is False


def test_tool_and_rest_read_same_onboarding(store, client):
    from flowershop_core.tools import TOOLS

    _pc(client, "/onboarding/beat", beat="needs", answer=["Money & finance"])
    handler = next(h for n, _, h in TOOLS if n == "flowershop_get_onboarding")
    result = json.loads(handler({}))
    assert result["ok"] is True
    assert result["state"]["needs"] == ["Money & finance"]
    # and a tool write is visible via REST
    tool_w = next(h for n, _, h in TOOLS if n == "flowershop_answer_onboarding")
    tool_w({"beat": "needs", "answer": ["Delivery"]})
    r = _get(client, "/onboarding")
    assert r.json()["needs"] == ["Delivery"]
