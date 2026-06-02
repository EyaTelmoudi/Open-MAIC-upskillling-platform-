"""Goals tracking router for personal and team goals."""

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from common.auth import decode_token
from common.database import get_db
from common.models import Team, TeamGoal, TeamMembership, User, UserGoal
from services.learning.services.goal_tracking import (
    AUTO_GOAL_TYPES,
    parse_goal_description,
    serialize_goal_description,
    sync_team_goals,
    sync_user_goals,
)

router = APIRouter(prefix="/goals", tags=["goals"])
security = HTTPBearer()

TEAM_GOAL_ROLES = {"Admin", "Manager", "TeamManager", "SuperAdmin"}
GOAL_MANAGEMENT_ROLES = TEAM_GOAL_ROLES


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


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    return date.fromisoformat(value)


def _parse_uuid(value: str, field_name: str) -> UUID:
    try:
        return UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} is invalid",
        ) from exc


def _required_text(data: dict, field_name: str) -> str:
    value = str(data.get(field_name) or "").strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} is required",
        )
    return value


def _target_count(goal) -> int:
    return max(int(getattr(goal, "target_count", 1) or 1), 1)


def _completion_rate(progress: int, target_count: int) -> float:
    return round(min(progress / max(target_count, 1), 1) * 100, 1)


def _normalize_status(progress: int, target_count: int, current_status: str) -> str:
    if progress >= target_count:
        return "completed"
    if current_status == "completed":
        return "active"
    return current_status or "active"


def _serialize_user_goal(goal: UserGoal) -> dict:
    target_count = _target_count(goal)
    progress = int(goal.progress or 0)
    goal_type, clean_description, is_auto_tracked = parse_goal_description(goal.description)
    return {
        "id": str(goal.id),
        "user_id": str(goal.user_id),
        "title": goal.title,
        "description": goal.description,
        "goal_type": goal_type,
        "clean_description": clean_description,
        "is_auto_tracked": is_auto_tracked,
        "target_date": goal.target_date.isoformat() if goal.target_date else None,
        "target_count": target_count,
        "xp_reward": int(getattr(goal, "xp_reward", 0) or 0),
        "progress": progress,
        "status": goal.status,
        "completion_rate": _completion_rate(progress, target_count),
        "created_at": goal.created_at.isoformat(),
        "updated_at": goal.updated_at.isoformat(),
    }


def _require_team_goal_role(user: User) -> None:
    if user.role not in TEAM_GOAL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only TeamManager, Manager, Admin, or SuperAdmin can manage team goals",
        )


def _require_goal_management_role(user: User) -> None:
    if user.role not in GOAL_MANAGEMENT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only TeamManager, Manager, Admin, or SuperAdmin can manage goals",
        )


def _assert_can_manage_personal_goal_for_user(actor: User, assignee: User) -> None:
    """Allow every user to manage their own goal; restrict cross-user assignment."""
    if actor.id == assignee.id:
        return

    _require_goal_management_role(actor)
    if actor.role != "SuperAdmin" and assignee.tenant_id != actor.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: user belongs to another tenant",
        )


def _has_team_membership(user_id: UUID, team_id: UUID, db: Session) -> bool:
    return (
        db.query(TeamMembership)
        .filter(TeamMembership.user_id == user_id, TeamMembership.team_id == team_id)
        .first()
        is not None
    )


def _get_team_for_goal_access(team_id: UUID, user: User, db: Session) -> Team:
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if user.role != "SuperAdmin" and team.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: team belongs to another tenant",
        )

    if user.role == "TeamManager" and team.manager_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: not your assigned team",
        )

    return team


def _can_view_team_goal(team: Team, user: User, db: Session) -> bool:
    if user.role in TEAM_GOAL_ROLES:
        if user.role == "TeamManager":
            return team.manager_id == user.id
        return True
    return _has_team_membership(user.id, team.id, db)


def _team_goal_member_stats(goal: TeamGoal, db: Session) -> dict:
    team = db.query(Team).filter(Team.id == goal.team_id).first()
    if not team:
        return {
            "total_members": 0,
            "completed_members": 0,
        }

    member_ids = [
        membership.user_id
        for membership in db.query(TeamMembership)
        .filter(TeamMembership.team_id == goal.team_id)
        .all()
    ]
    if not member_ids:
        return {
            "total_members": 0,
            "completed_members": 0,
        }

    matching_goals = (
        db.query(UserGoal)
        .filter(
            UserGoal.user_id.in_(member_ids),
            func.lower(UserGoal.title) == goal.title.lower(),
        )
        .all()
    )
    completed_members = sum(1 for item in matching_goals if item.status == "completed")
    return {
        "total_members": len(member_ids),
        "completed_members": completed_members,
    }


def _serialize_team_goal(goal: TeamGoal, db: Session) -> dict:
    team = db.query(Team).filter(Team.id == goal.team_id).first()
    target_count = _target_count(goal)
    manual_progress = int(goal.progress or 0)
    member_stats = _team_goal_member_stats(goal, db)
    aggregate_progress = max(manual_progress, member_stats["completed_members"])
    return {
        "id": str(goal.id),
        "team_id": str(goal.team_id),
        "team_name": team.name if team else "Unknown Team",
        "title": goal.title,
        "description": goal.description,
        "target_date": goal.target_date.isoformat() if goal.target_date else None,
        "target_count": target_count,
        "xp_reward": int(getattr(goal, "xp_reward", 0) or 0),
        "progress": aggregate_progress,
        "status": goal.status,
        "completion_rate": _completion_rate(aggregate_progress, target_count),
        "total_members": member_stats["total_members"],
        "completed_members": member_stats["completed_members"],
        "created_at": goal.created_at.isoformat(),
        "updated_at": goal.updated_at.isoformat(),
    }


@router.get("", response_model=list[dict])
def list_personal_goals(
    user_id: Optional[UUID] = Query(None, alias="user_id"),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_from_payload(current_user, db)
    target_user_id = user.id
    if user_id and user_id != user.id:
        _require_goal_management_role(user)
        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.role != "SuperAdmin" and target_user.tenant_id != user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: user belongs to another tenant",
            )
        target_user_id = target_user.id

    sync_user_goals(db, target_user_id)

    query = db.query(UserGoal).filter(UserGoal.user_id == target_user_id)
    if status_filter:
        query = query.filter(UserGoal.status == status_filter)
    goals = query.order_by(UserGoal.created_at.desc()).all()
    return [_serialize_user_goal(goal) for goal in goals]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_personal_goal(
    goal_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_from_payload(current_user, db)

    assignee_id_raw = goal_data.get("user_id") or str(user.id)

    assignee_id = _parse_uuid(assignee_id_raw, "user_id")
    assignee = db.query(User).filter(User.id == assignee_id).first()
    if not assignee:
        raise HTTPException(status_code=404, detail="Assigned user not found")
    _assert_can_manage_personal_goal_for_user(user, assignee)

    target_count = max(int(goal_data.get("target_count", 1) or 1), 1)
    goal_type = goal_data.get("goal_type", "manual")
    if goal_type not in AUTO_GOAL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Goal type must be one of the automatic tracking options",
        )
    description = serialize_goal_description(goal_data.get("description"), goal_type)

    goal = UserGoal(
        user_id=assignee.id,
        title=_required_text(goal_data, "title"),
        description=description,
        target_date=_parse_date(goal_data.get("target_date")),
        target_count=target_count,
        xp_reward=max(int(goal_data.get("xp_reward", 0) or 0), 0),
        progress=0,
        status="active",
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    sync_user_goals(db, assignee.id)
    db.refresh(goal)
    return _serialize_user_goal(goal)


@router.put("/{goal_id}", response_model=dict)
def update_personal_goal(
    goal_id: UUID,
    goal_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_from_payload(current_user, db)
    goal = db.query(UserGoal).filter(UserGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    assignee = db.query(User).filter(User.id == goal.user_id).first()
    if not assignee:
        raise HTTPException(status_code=404, detail="Assigned user not found")
    _assert_can_manage_personal_goal_for_user(user, assignee)
    if "progress" in goal_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Progress is updated automatically from learner activity",
        )

    for field in ["title", "description"]:
        if field in goal_data and goal_data[field] is not None:
            setattr(goal, field, goal_data[field])

    if "target_date" in goal_data:
        goal.target_date = _parse_date(goal_data.get("target_date"))
    if "target_count" in goal_data and goal_data["target_count"] is not None:
        goal.target_count = max(int(goal_data["target_count"]), 1)
    if "xp_reward" in goal_data and goal_data["xp_reward"] is not None:
        goal.xp_reward = max(int(goal_data["xp_reward"]), 0)
    if "goal_type" in goal_data or "description" in goal_data:
        existing_goal_type, existing_clean_description, _ = parse_goal_description(goal.description)
        goal_type = goal_data.get("goal_type", existing_goal_type)
        description = goal_data.get("description", existing_clean_description)
        goal.description = serialize_goal_description(description, goal_type)

    db.commit()
    db.refresh(goal)
    sync_user_goals(db, goal.user_id)
    db.refresh(goal)
    return _serialize_user_goal(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_personal_goal(
    goal_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_from_payload(current_user, db)
    goal = db.query(UserGoal).filter(UserGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    assignee = db.query(User).filter(User.id == goal.user_id).first()
    if not assignee:
        raise HTTPException(status_code=404, detail="Assigned user not found")
    _assert_can_manage_personal_goal_for_user(user, assignee)
    db.delete(goal)
    db.commit()


@router.get("/team", response_model=list[dict])
def list_team_goals(
    team_id: Optional[UUID] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_from_payload(current_user, db)

    query = db.query(TeamGoal).join(Team, TeamGoal.team_id == Team.id)
    if user.role != "SuperAdmin":
        query = query.filter(Team.tenant_id == user.tenant_id)
    if user.role == "TeamManager":
        query = query.filter(Team.manager_id == user.id)
    elif user.role not in TEAM_GOAL_ROLES:
        member_team_ids = [
            membership.team_id
            for membership in db.query(TeamMembership)
            .filter(TeamMembership.user_id == user.id)
            .all()
        ]
        if not member_team_ids:
            return []
        query = query.filter(TeamGoal.team_id.in_(member_team_ids))
    if team_id:
        team = _get_team_for_goal_access(team_id, user, db)
        if not _can_view_team_goal(team, user, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: not a member of this team",
            )
        query = query.filter(TeamGoal.team_id == team.id)

    goals = query.order_by(TeamGoal.created_at.desc()).all()
    return [_serialize_team_goal(goal, db) for goal in goals]


@router.post("/team", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_team_goal(
    goal_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_from_payload(current_user, db)
    _require_team_goal_role(user)
    team_id = _parse_uuid(_required_text(goal_data, "team_id"), "team_id")
    team = _get_team_for_goal_access(team_id, user, db)
    target_count = max(int(goal_data.get("target_count", 1) or 1), 1)
    goal_type = goal_data.get("goal_type", "manual")
    if goal_type not in AUTO_GOAL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Goal type must be one of the automatic tracking options",
        )
    description = serialize_goal_description(goal_data.get("description"), goal_type)

    goal = TeamGoal(
        team_id=team.id,
        title=_required_text(goal_data, "title"),
        description=description,
        target_date=_parse_date(goal_data.get("target_date")),
        target_count=target_count,
        xp_reward=max(int(goal_data.get("xp_reward", 0) or 0), 0),
        progress=0,
        status="active",
        created_by_id=user.id,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    sync_team_goals(db, team.id)
    db.refresh(goal)
    return _serialize_team_goal(goal, db)


@router.put("/team/{goal_id}", response_model=dict)
def update_team_goal(
    goal_id: UUID,
    goal_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_from_payload(current_user, db)
    _require_team_goal_role(user)
    goal = db.query(TeamGoal).filter(TeamGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Team goal not found")
    _get_team_for_goal_access(goal.team_id, user, db)

    for field in ["title", "description"]:
        if field in goal_data and goal_data[field] is not None:
            setattr(goal, field, goal_data[field])

    if "target_date" in goal_data:
        goal.target_date = _parse_date(goal_data.get("target_date"))
    if "target_count" in goal_data and goal_data["target_count"] is not None:
        goal.target_count = max(int(goal_data["target_count"]), 1)
    if "xp_reward" in goal_data and goal_data["xp_reward"] is not None:
        goal.xp_reward = max(int(goal_data["xp_reward"]), 0)
    if "progress" in goal_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Progress is updated automatically from team activity",
        )
    if "goal_type" in goal_data or "description" in goal_data:
        existing_goal_type, existing_clean_description, _ = parse_goal_description(goal.description)
        goal_type = goal_data.get("goal_type", existing_goal_type)
        description = goal_data.get("description", existing_clean_description)
        goal.description = serialize_goal_description(description, goal_type)

    db.commit()
    db.refresh(goal)
    sync_team_goals(db, goal.team_id)
    db.refresh(goal)
    return _serialize_team_goal(goal, db)
