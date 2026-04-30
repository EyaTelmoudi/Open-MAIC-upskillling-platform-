"""Focused tests for Sprint 3 skill-gap analysis."""

from types import SimpleNamespace
from uuid import uuid4

from services.learning.analytics.gap_engine import compute_skill_gaps, extract_user_target_skills
from services.learning.analytics.skill_gap import collect_prerequisite_ids


def test_collect_prerequisite_ids_returns_dependency_chain():
    python_id = uuid4()
    fastapi_id = uuid4()
    rest_id = uuid4()
    edges = [
        SimpleNamespace(from_skill_id=python_id, to_skill_id=fastapi_id, edge_type="prerequisite"),
        SimpleNamespace(from_skill_id=rest_id, to_skill_id=fastapi_id, edge_type="prerequisite"),
    ]

    result = collect_prerequisite_ids(fastapi_id, edges)

    assert python_id in result
    assert rest_id in result


def test_extract_user_target_skills_combines_role_defaults_and_selected_skills():
    user = SimpleNamespace(role="TeamIntern", skills={"selected_skills": ["React"]})

    result = extract_user_target_skills(user)

    assert "Python" in result
    assert "TypeScript" in result
    assert "React" in result


def test_compute_skill_gaps_returns_target_and_prerequisite_gaps():
    python_skill = SimpleNamespace(id=uuid4(), name="Python", category="Programming")
    fastapi_skill = SimpleNamespace(id=uuid4(), name="FastAPI", category="Backend")
    course = SimpleNamespace(
        id=uuid4(),
        title="React Basics",
        description="Frontend foundations",
        category="Frontend",
        difficulty="Beginner",
        is_published=True,
        tenant_id="tenant-1",
    )
    edges = [
        SimpleNamespace(from_skill_id=python_skill.id, to_skill_id=fastapi_skill.id, edge_type="prerequisite"),
    ]

    class FakeQuery:
        def __init__(self, data):
            self.data = data

        def order_by(self, *args, **kwargs):
            return self

        def all(self):
            return self.data

        def join(self, *args, **kwargs):
            return self

        def filter(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

    class FakeDb:
        def query(self, model):
            name = getattr(model, "__name__", "")
            if name == "Skill":
                return FakeQuery([python_skill, fastapi_skill])
            if name == "SkillEdge":
                return FakeQuery(edges)
            if name == "Course":
                return FakeQuery([course])
            return FakeQuery([])

    user = SimpleNamespace(
        id=uuid4(),
        role="TeamMember",
        skills=[],
        tenant_id="tenant-1",
    )

    result = compute_skill_gaps(user, FakeDb())

    gap_names = [gap["skill_name"] for gap in result["gaps"]]
    assert "FastAPI" in gap_names
    assert "Python" in gap_names
