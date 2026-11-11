"""The bundled theme: prepared on request, activated only by the owner's click.

The rule these tests exist to protect — nothing here switches a skin. ``apply_choice``
returns an ``activate`` name for the client to hand to Hermes' own ``config.set``; the
plugin has no path that changes ``display.skin`` itself.
"""
from __future__ import annotations

import pytest

from flowershop_core.errors import ValidationError
from flowershop_core.services import onboarding, theme


@pytest.fixture
def skins(tmp_path):
    return tmp_path / "hermes" / "skins"


def test_catalog_matches_the_shipped_files(store, skins):
    names = [t["name"] for t in theme.bundled()]
    assert names == ["anthousa", "anthousa-night"]
    # every catalog entry resolves to a real file whose own name: line agrees
    for spec in theme.bundled():
        written = theme.install(skins, [spec["name"]])
        assert written["copied"] == [spec["name"]]
        assert (skins / spec["file"]).is_file()


def test_state_is_unavailable_without_a_skins_dir(store):
    st = theme.state(store, skins_dir=None, active_skin=None)
    assert st["available"] is False
    assert st["installed"] == []
    assert st["choice"] is None
    assert len(st["bundled"]) == 2


def test_install_copies_both_and_is_idempotent(store, skins):
    first = theme.install(skins)
    assert sorted(first["copied"]) == ["anthousa", "anthousa-night"]
    second = theme.install(skins)
    assert second["copied"] == []
    assert sorted(second["unchanged"]) == ["anthousa", "anthousa-night"]


def test_apply_prepares_the_skin_but_reports_the_switch(store, skins):
    res = theme.apply_choice(store, {"choice": "apply", "theme": "anthousa"},
                             skins_dir=skins, active_skin="claude-readability-dark")
    assert res["activate"] == "anthousa"            # the caller's click performs this
    assert res["copied"] == ["anthousa"]
    assert res["choice"]["previous_skin"] == "claude-readability-dark"
    assert (skins / "anthousa.yaml").is_file()
    # recorded on the beat, so onboarding advances
    assert onboarding.state(store)["beats"]["theme"]["answer"]["choice"] == "apply"


def test_keep_changes_nothing_at_all(store, skins):
    res = theme.apply_choice(store, {"choice": "keep"}, skins_dir=skins, active_skin="mono")
    assert res["activate"] is None
    assert not res["copied"]
    assert res["choice"]["previous_skin"] is None
    assert not skins.exists()


def test_switching_between_twins_keeps_the_original_undo_target(store, skins):
    """Picking the dusk twin while the day twin is on must not make the day twin
    the thing you undo — the owner's ORIGINAL theme is."""
    theme.apply_choice(store, {"choice": "apply", "theme": "anthousa"},
                       skins_dir=skins, active_skin="mono")
    second = theme.apply_choice(store, {"choice": "apply", "theme": "anthousa-night"},
                                skins_dir=skins, active_skin="anthousa")
    assert second["choice"]["previous_skin"] == "mono"
    assert theme.state(store, skins_dir=skins, active_skin="anthousa-night")["previous"] == "mono"


def test_revert_reports_the_previous_skin_then_clears_the_undo(store, skins):
    theme.apply_choice(store, {"choice": "apply", "theme": "anthousa-night"},
                       skins_dir=skins, active_skin="slate")
    assert theme.revert(store, skins_dir=skins, active_skin="anthousa-night")["revert_to"] == "slate"
    # once used, the undo affordance is gone
    assert theme.state(store, skins_dir=skins, active_skin="slate")["previous"] is None


def test_revert_without_a_record_is_refused(store, skins):
    with pytest.raises(ValidationError):
        theme.revert(store, skins_dir=skins, active_skin="mono")


def test_bad_input_is_refused(store, skins):
    with pytest.raises(ValidationError):
        theme.apply_choice(store, {"choice": "apply", "theme": "not-a-theme"}, skins_dir=skins)
    with pytest.raises(ValidationError):
        theme.apply_choice(store, {"choice": "maybe"}, skins_dir=skins)
    with pytest.raises(ValidationError):
        theme.apply_choice(store, {"choice": "apply", "theme": "anthousa"}, skins_dir=None)


def test_theme_beat_is_optional_and_never_blocks_completion(store):
    """Declining — or never reaching — the offer must not leave setup unfinished."""
    for beat in ("welcome", "business", "needs", "fit", "team", "bots", "custom", "first_result"):
        onboarding.answer(store, beat, None)
    st = onboarding.state(store)
    assert st["beats"].get("theme") is None
    assert st["complete"] is True                       # complete without the offer…
    assert [s["optional"] for s in st["steps"] if s["id"] == "theme"] == [True]
    assert st["current_step"] == "theme"                # …but still the next thing to show


def test_reset_clears_the_recorded_theme(store, skins):
    theme.apply_choice(store, {"choice": "keep"}, skins_dir=skins, active_skin="mono")
    assert theme.state(store, skins_dir=None)["choice"] is not None
    onboarding.reset(store)
    assert theme.state(store, skins_dir=None)["choice"] is None
