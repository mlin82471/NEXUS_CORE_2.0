"""Planner tests: schema validation, rule fallback, PlanSchema validation."""
import pytest
from app.schemas import PlanSchema
from app.planner.qwen_planner import rule_fallback


def test_rule_fallback_single_step():
    steps = rule_fallback("Hello world", "general", 3)
    assert len(steps) == 1
    assert steps[0]["step_key"] == "s1"
    assert steps[0]["role"] == "analysis"
    assert steps[0]["depends_on"] == []


def test_rule_fallback_uses_correct_role():
    steps = rule_fallback("Write code", "coding", 2)
    assert steps[0]["role"] == "coding"


def test_plan_schema_valid():
    validated = PlanSchema(steps=[
        {"step_key": "s1", "goal": "Do A", "role": "research", "depends_on": []},
        {"step_key": "s2", "goal": "Analyze A", "role": "analysis", "depends_on": ["s1"]},
    ])
    assert len(validated.steps) == 2


def test_plan_schema_rejects_unknown_role():
    with pytest.raises(ValueError):
        PlanSchema(steps=[{"step_key": "s1", "goal": "X", "role": "evil"}])


def test_plan_schema_rejects_cycle():
    with pytest.raises(ValueError, match="cycle"):
        PlanSchema(steps=[
            {"step_key": "a", "goal": "A", "role": "research", "depends_on": ["b"]},
            {"step_key": "b", "goal": "B", "role": "analysis", "depends_on": ["a"]},
        ])


def test_plan_schema_rejects_unknown_dep():
    with pytest.raises(ValueError, match="unknown key"):
        PlanSchema(steps=[
            {"step_key": "a", "goal": "A", "role": "research", "depends_on": ["nonexistent"]},
        ])


def test_plan_schema_rejects_self_dep():
    with pytest.raises(ValueError, match="itself"):
        PlanSchema(steps=[{"step_key": "a", "goal": "A", "role": "research", "depends_on": ["a"]}])


def test_plan_schema_rejects_duplicate_keys():
    with pytest.raises(ValueError, match="duplicate"):
        PlanSchema(steps=[
            {"step_key": "a", "goal": "A", "role": "research"},
            {"step_key": "a", "goal": "B", "role": "analysis"},
        ])


def test_plan_schema_rejects_empty():
    with pytest.raises(ValueError):
        PlanSchema(steps=[])


def test_plan_schema_rejects_empty_goal():
    with pytest.raises(ValueError):
        PlanSchema(steps=[{"step_key": "a", "goal": "", "role": "research"}])

# ---- New tests for ChatGPT review fixes ----

def test_plan_schema_rejects_blank_key():
    with pytest.raises(ValueError, match="blank"):
        PlanSchema(steps=[{"step_key": "   ", "goal": "X", "role": "research"}])

def test_plan_schema_rejects_blank_goal():
    with pytest.raises(ValueError, match="blank"):
        PlanSchema(steps=[{"step_key": "s1", "goal": "   ", "role": "research"}])

def test_plan_schema_rejects_duplicate_dep():
    with pytest.raises(ValueError, match="duplicate dependency"):
        PlanSchema(steps=[
            {"step_key": "s1", "goal": "A", "role": "research"},
            {"step_key": "s2", "goal": "B", "role": "analysis", "depends_on": ["s1", "s1"]},
        ])

def test_plan_schema_rejects_extra_field():
    with pytest.raises(ValueError):
        PlanSchema(steps=[{"step_key": "s1", "goal": "A", "role": "research", "bogus": 123}])

def test_plan_schema_allows_cross_dep():
    # step order != dep order is valid
    validated = PlanSchema(steps=[
        {"step_key": "s2", "goal": "B", "role": "analysis", "depends_on": ["s1"]},
        {"step_key": "s1", "goal": "A", "role": "research"},
    ])
    assert len(validated.steps) == 2

def test_plan_schema_three_node_cycle():
    with pytest.raises(ValueError, match="cycle"):
        PlanSchema(steps=[
            {"step_key": "a", "goal": "A", "role": "research", "depends_on": ["c"]},
            {"step_key": "b", "goal": "B", "role": "analysis", "depends_on": ["a"]},
            {"step_key": "c", "goal": "C", "role": "knowledge", "depends_on": ["b"]},
        ])

def test_plan_schema_role_literal_type():
    # RoleType Literal should reject at type level
    with pytest.raises(ValueError):
        PlanSchema(steps=[{"step_key": "s1", "goal": "X", "role": "invalid_role"}])