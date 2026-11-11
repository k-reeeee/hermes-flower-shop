"""Onboarding service unit tests (spec ONBOARDING §4, §5, §9)."""
from __future__ import annotations

import pytest

from flowershop_core.errors import ValidationError
from flowershop_core.services import onboarding, profile


def test_initial_state(store):
    st = onboarding.state(store)
    assert st["profile"]["business_type"] == "florist"
    assert st["needs"] == []
    assert st["fit"] == {}
    assert st["bots"] == []
    assert st["custom_plugin"] == {}
    assert st["complete"] is False
    assert len(st["steps"]) == 8
    assert st["steps"][0]["id"] == "welcome"
    assert st["current_step"] == "welcome"
    assert {s["id"] for s in st["steps"]} == {
        "welcome", "business", "needs", "fit", "team", "bots", "custom", "first_result",
    }


def test_recommend_team_mapping(store):
    assert onboarding.recommend_team(["Orders & customers", "Delivery"]) == ["sales", "logistics"]
    assert "production" in onboarding.recommend_team(["Production & recipes"])
    assert "finance" in onboarding.recommend_team(["Money & finance"])
    assert onboarding.recommend_team(["Something else"]) == []
    assert onboarding.recommend_team([]) == []


def test_assess_fit_covered(store):
    needs = ["Orders & customers", "Stock & inventory"]
    fit = onboarding.assess_fit("florist", needs)
    assert fit["covered"] == ["Orders & customers", "Stock & inventory"]
    assert fit["gaps"] == []
    assert "set" in fit["assessment"].lower()


def test_assess_fit_gaps(store):
    fit = onboarding.assess_fit("florist", ["Orders & customers", "Something else"])
    assert "Orders & customers" in fit["covered"]
    assert fit["gaps"] == ["Something else"]
    assert "Something else" in fit["assessment"]


def test_assess_custom(store):
    needs = ["Orders & customers"]
    fit = onboarding.assess_fit("florist", needs)
    custom = onboarding.assess_custom("florist", needs, fit)
    assert custom["needed"] is False
    assert custom["reasons"] == []
    assert custom["offer"]

    bad = onboarding.assess_custom("bakery", ["Something else"], None)
    assert bad["needed"] is True
    assert any("Something else" in r for r in bad["reasons"])
    assert bad["offer"]


def test_recommend_bots(store):
    bots = onboarding.recommend_bots(["Orders & customers", "Delivery"], None)
    sales = next(b for b in bots if b["name"] == "sales")
    assert sales["profile"] == "flower-shop-sales"
    logi = next(b for b in bots if b["name"] == "logistics")
    assert logi["profile"] == "flower-shop-logistics"
    for b in bots:
        assert b["purpose"]


def test_answer_records_beat(store):
    st = onboarding.answer(store, "needs", ["Orders & customers"])
    assert st["needs"] == ["Orders & customers"]
    more = next(s for s in st["steps"] if s["id"] == "needs")
    assert more["done"] is True


def test_answer_updates_enabled_departments(store):
    onboarding.answer(store, "needs", ["Orders & customers", "Delivery"])
    st = onboarding.answer(store, "team", ["sales", "logistics"])
    assert st["profile"]["enabled_departments"] == ["sales", "logistics"]


def test_answer_validates_unknown_beat(store):
    with pytest.raises(ValidationError):
        onboarding.answer(store, "nope", "x")


def test_answer_validates_unknown_need(store):
    with pytest.raises(ValidationError):
        onboarding.answer(store, "needs", ["grow orchids"])


def test_complete_marks_all_beats(store):
    st = onboarding.complete(store)
    assert st["complete"] is True
    st2 = onboarding.state(store)
    assert st2["complete"] is True
    assert all(s["done"] for s in st2["steps"])


def test_state_merges_profile(store):
    profile.update(store, {"business_name": "Mawar Putih", "business_type": "florist"})
    st = onboarding.state(store)
    assert st["profile"]["business_name"] == "Mawar Putih"


def test_reset_clears_answers_keeps_business_data(store):
    # Complete the flow so there is something to wipe.
    onboarding.answer(store, "needs", ["Orders & customers", "Delivery"])
    onboarding.answer(store, "team", ["sales", "logistics"])
    onboarding.answer(store, "bots", [{"name": "Sales assistant", "profile": "flower-shop-sales"}])
    onboarding.answer(store, "custom", {"needed": False})
    onboarding.complete(store)
    profile.update(store, {"business_name": "Mawar Putih"})
    assert onboarding.state(store)["complete"] is True

    # Seed business records to prove reset does not touch them.
    from flowershop_core.seed import counts, seed_demo
    seed_demo(store)
    before = counts(store)
    assert before["orders"] > 0  # sanity: there is business data to protect

    st = onboarding.reset(store)
    assert st["complete"] is False
    assert st["needs"] == []
    assert st["fit"] == {}
    assert st["bots"] == []
    assert st["custom_plugin"] == {}
    assert all(not s["done"] for s in st["steps"])
    assert st["current_step"] == "welcome"

    # Business records survive.
    after = counts(store)
    assert after == before
    # Profile business name survives too.
    assert onboarding.state(store)["profile"]["business_name"] == "Mawar Putih"
