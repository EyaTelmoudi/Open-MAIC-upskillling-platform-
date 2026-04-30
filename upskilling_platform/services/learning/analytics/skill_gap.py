"""Skill graph helpers for Sprint 3 skill-gap analysis."""

from collections import defaultdict
from typing import Iterable
from uuid import UUID

from common.models import Skill, SkillEdge


DEFAULT_SKILLS = [
    {
        "name": "Python",
        "category": "Programming",
        "description": "Core backend programming and scripting fundamentals.",
    },
    {
        "name": "SQL",
        "category": "Data",
        "description": "Querying and shaping relational data.",
    },
    {
        "name": "PostgreSQL",
        "category": "Data",
        "description": "Working with PostgreSQL databases and performance basics.",
    },
    {
        "name": "FastAPI",
        "category": "Backend",
        "description": "Building Python APIs with FastAPI.",
    },
    {
        "name": "REST APIs",
        "category": "Backend",
        "description": "Designing and consuming API contracts.",
    },
    {
        "name": "TypeScript",
        "category": "Frontend",
        "description": "Typed JavaScript for frontend and full-stack development.",
    },
    {
        "name": "React",
        "category": "Frontend",
        "description": "Building interactive web interfaces with React.",
    },
    {
        "name": "Prompt Engineering",
        "category": "AI",
        "description": "Structuring effective prompts for LLM-based systems.",
    },
    {
        "name": "Data Analysis",
        "category": "Analytics",
        "description": "Turning raw information into actionable insights.",
    },
    {
        "name": "Leadership",
        "category": "Management",
        "description": "Driving teams, alignment, and execution.",
    },
]

DEFAULT_EDGES = [
    ("Python", "FastAPI", "prerequisite"),
    ("REST APIs", "FastAPI", "prerequisite"),
    ("SQL", "PostgreSQL", "prerequisite"),
    ("TypeScript", "React", "prerequisite"),
    ("Python", "Data Analysis", "prerequisite"),
]


def seed_default_skill_graph(db) -> None:
    """Populate the skill graph with a default taxonomy when empty."""
    if db.query(Skill).count() > 0:
        return

    skill_map: dict[str, Skill] = {}
    for item in DEFAULT_SKILLS:
        skill = Skill(
            name=item["name"],
            category=item["category"],
            description=item["description"],
        )
        db.add(skill)
        db.flush()
        skill_map[skill.name] = skill

    for from_name, to_name, edge_type in DEFAULT_EDGES:
        db.add(
            SkillEdge(
                from_skill_id=skill_map[from_name].id,
                to_skill_id=skill_map[to_name].id,
                edge_type=edge_type,
            )
        )

    db.commit()


def collect_prerequisite_ids(
    target_skill_id: UUID,
    edges: Iterable[SkillEdge],
) -> list[UUID]:
    """Return all prerequisite skill ids for a target skill in dependency order."""
    reverse_graph: dict[UUID, list[UUID]] = defaultdict(list)
    for edge in edges:
        if edge.edge_type == "prerequisite":
            reverse_graph[edge.to_skill_id].append(edge.from_skill_id)

    ordered: list[UUID] = []
    seen: set[UUID] = set()

    def dfs(skill_id: UUID) -> None:
        for prereq_id in reverse_graph.get(skill_id, []):
            if prereq_id in seen:
                continue
            dfs(prereq_id)
            seen.add(prereq_id)
            ordered.append(prereq_id)

    dfs(target_skill_id)
    return ordered


def serialize_skill_graph(skills: Iterable[Skill], edges: Iterable[SkillEdge]) -> dict:
    """Serialize the graph for API responses."""
    skill_list = list(skills)
    edge_list = list(edges)
    return {
        "skills": [
            {
                "id": str(skill.id),
                "name": skill.name,
                "category": skill.category,
                "description": skill.description,
            }
            for skill in skill_list
        ],
        "edges": [
            {
                "id": str(edge.id),
                "from_skill_id": str(edge.from_skill_id),
                "to_skill_id": str(edge.to_skill_id),
                "edge_type": edge.edge_type,
            }
            for edge in edge_list
        ],
    }
