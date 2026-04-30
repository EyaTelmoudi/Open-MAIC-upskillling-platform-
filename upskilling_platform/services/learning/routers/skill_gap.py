"""Skill-gap analysis router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from common.auth import decode_token
from common.database import get_db
from common.models import Skill, SkillEdge, User

from services.learning.analytics.gap_engine import compute_skill_gaps
from services.learning.analytics.skill_gap import (
    collect_prerequisite_ids,
    serialize_skill_graph,
)

router = APIRouter(prefix="/skill-gap", tags=["skill-gap"])
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def _get_user_from_payload(payload: dict, db: Session) -> User:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/graph", response_model=dict)
def get_skill_graph(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_user_from_payload(current_user, db)
    skills = db.query(Skill).order_by(Skill.name.asc()).all()
    edges = db.query(SkillEdge).all()
    return serialize_skill_graph(skills, edges)


@router.get("/graph/{skill_id}/dependencies", response_model=dict)
def get_skill_dependencies(
    skill_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_user_from_payload(current_user, db)
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    skills = db.query(Skill).all()
    edges = db.query(SkillEdge).all()
    skill_names = {item.id: item.name for item in skills}
    dependency_ids = collect_prerequisite_ids(skill.id, edges)
    return {
        "skill_id": str(skill.id),
        "skill_name": skill.name,
        "dependencies": [
            {
                "id": str(dependency_id),
                "name": skill_names[dependency_id],
            }
            for dependency_id in dependency_ids
            if dependency_id in skill_names
        ],
    }


@router.get("/gaps", response_model=dict)
def get_skill_gaps(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_from_payload(current_user, db)
    return compute_skill_gaps(user, db)
