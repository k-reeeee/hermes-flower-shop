"""REST surface for the bundled theme — the endpoints the desktop card drives.

The card's whole job is: read the offer, post the owner's choice, and hand the
returned skin name to Hermes' own ``config.set`` RPC. These tests cover the first
two and prove the plugin never activates anything by itself.
"""
from __future__ import annotations

API = "/api/plugins/flower-shop"


def test_get_theme_without_a_hermes_home(client, monkeypatch):
    """Outside Hermes the offer must degrade to 'unavailable', not blow up."""
    from flowershop_core import hermes_env

    # Pin the home lookup to "no Hermes" so the test holds even when it runs
    # inside a real Hermes source tree (where home() would resolve a live home).
    monkeypatch.setattr(hermes_env, "home", lambda: None)
    r = client.get(f"{API}/theme")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert [t["name"] for t in body["bundled"]] == ["anthousa", "anthousa-night"]
    assert body["installed"] == []
    assert body["choice"] is None


def test_apply_installs_and_returns_the_skin_to_activate(client, monkeypatch, tmp_path):
    monkeypatch.setenv("FLOWERSHOP_HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("FLOWERSHOP_ACTIVE_SKIN", "claude-readability-dark")
    r = client.post(f"{API}/theme", json={"choice": "apply", "theme": "anthousa"})
    assert r.status_code == 200
    body = r.json()
    assert body["activate"] == "anthousa"           # the client performs the switch
    assert body["copied"] == ["anthousa"]
    assert (tmp_path / "skins" / "anthousa.yaml").is_file()
    assert body["choice"]["previous_skin"] == "claude-readability-dark"
    # the onboarding beat is recorded in the same call
    onb = client.get(f"{API}/onboarding").json()
    assert onb["beats"]["theme"]["answer"]["theme"] == "anthousa"


def test_keep_writes_no_files(client, monkeypatch, tmp_path):
    monkeypatch.setenv("FLOWERSHOP_HERMES_HOME", str(tmp_path))
    r = client.post(f"{API}/theme", json={"choice": "keep"})
    assert r.status_code == 200
    assert r.json()["activate"] is None
    assert not (tmp_path / "skins").exists()


def test_bad_choice_is_a_validation_error(client):
    r = client.post(f"{API}/theme", json={"choice": "burn-it-all"})
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "validation_error"


def test_revert_returns_the_skin_to_go_back_to(client, monkeypatch, tmp_path):
    monkeypatch.setenv("FLOWERSHOP_HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("FLOWERSHOP_ACTIVE_SKIN", "slate")
    assert client.post(f"{API}/theme", json={"choice": "apply", "theme": "anthousa-night"}).status_code == 200
    monkeypatch.setenv("FLOWERSHOP_ACTIVE_SKIN", "anthousa-night")
    r = client.post(f"{API}/theme/revert")
    assert r.status_code == 200
    assert r.json()["revert_to"] == "slate"


def test_revert_without_a_record_is_a_400(client, monkeypatch, tmp_path):
    monkeypatch.setenv("FLOWERSHOP_HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("FLOWERSHOP_ACTIVE_SKIN", "mono")
    r = client.post(f"{API}/theme/revert")
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "validation_error"
