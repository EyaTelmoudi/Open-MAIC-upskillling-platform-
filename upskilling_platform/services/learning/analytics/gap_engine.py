"""Gap computation engine for Sprint 3 skill-gap analysis."""

from typing import Iterable

from common.models import Course, Enrollment, Skill, SkillEdge

from .skill_gap import collect_prerequisite_ids

ROLE_TARGET_SKILLS = {
    "Admin": ["Leadership", "Data Analysis"],
    "Manager": ["Leadership", "Data Analysis"],
    "TeamManager": ["Leadership", "React"],
    "LearningExpert": ["FastAPI", "Prompt Engineering"],
    "TeamMember": ["FastAPI", "React"],
    "TeamIntern": ["Python", "TypeScript"],
}


def extract_user_target_skills(user) -> list[str]:
    """Resolve target skills from role defaults plus onboarding-selected skills."""
    targets = list(ROLE_TARGET_SKILLS.get(user.role, []))
    raw_skills = user.skills or []
    if isinstance(raw_skills, dict):
        raw_skills = raw_skills.get("selected_skills", [])
    if isinstance(raw_skills, list):
        for skill_name in raw_skills:
            if isinstance(skill_name, str) and skill_name not in targets:
                targets.append(skill_name)
    return targets


def infer_mastered_skills(user, skills: Iterable[Skill], db) -> list[str]:
    """Infer current mastery from completed course titles and descriptions."""
    completed_courses = (
        db.query(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .filter(Enrollment.user_id == user.id, Enrollment.status == "completed")
        .all()
    )
    text_blobs = [
        " ".join(
            filter(
                None,
                [course.title, course.description or "", course.category or ""],
            )
        ).lower()
        for course in completed_courses
    ]

    mastered: list[str] = []
    for skill in skills:
        skill_name = skill.name.lower()
        if any(skill_name in blob for blob in text_blobs):
            mastered.append(skill.name)
    return mastered


def recommend_courses_for_skill(user, skill_name: str, db) -> list[dict]:
    """Return tenant-safe published course suggestions for a missing skill."""
    query = db.query(Course).filter(Course.is_published.is_(True))
    if user.role != "SuperAdmin":
        query = query.filter(Course.tenant_id == user.tenant_id)

    needle = f"%{skill_name}%"
    courses = (
        query.filter(
            (Course.title.ilike(needle))
            | (Course.description.ilike(needle))
            | (Course.category.ilike(needle))
        )
        .limit(3)
        .all()
    )
    return [
        {
            "id": str(course.id),
            "title": course.title,
            "category": course.category,
            "difficulty": course.difficulty,
            "is_published": course.is_published,
        }
        for course in courses
    ]


def compute_skill_gaps(user, db) -> dict:
    """Compute a ranked set of skill gaps for the current user."""
    skills = db.query(Skill).order_by(Skill.name.asc()).all()
    edges = db.query(SkillEdge).all()
    skills_by_name = {skill.name.lower(): skill for skill in skills}
    skill_names_by_id = {skill.id: skill.name for skill in skills}

    target_skill_names = extract_user_target_skills(user)
    mastered_skill_names = set(infer_mastered_skills(user, skills, db))
    gaps: list[dict] = []
    seen_missing: set[str] = set()

    for target_name in target_skill_names:
        skill = skills_by_name.get(target_name.lower())
        dependency_names: list[str] = []

        if skill is not None:
            dependency_ids = collect_prerequisite_ids(skill.id, edges)
            dependency_names = [
                skill_names_by_id[dependency_id]
                for dependency_id in dependency_ids
                if dependency_id in skill_names_by_id
            ]

        evaluation_chain = dependency_names + [target_name]
        for missing_name in evaluation_chain:
            if missing_name in mastered_skill_names or missing_name in seen_missing:
                continue
            seen_missing.add(missing_name)
            gaps.append(
                {
                    "skill_name": missing_name,
                    "target_skill": target_name,
                    "gap_type": "target" if missing_name == target_name else "prerequisite",
                    "severity": "high" if missing_name == target_name else "medium",
                    "recommended_courses": recommend_courses_for_skill(user, missing_name, db),
                }
            )

    severity_rank = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda item: (severity_rank[item["severity"]], item["skill_name"]))

    return {
        "role": user.role,
        "target_skills": target_skill_names,
        "mastered_skills": sorted(mastered_skill_names),
        "gaps": gaps,
    }
