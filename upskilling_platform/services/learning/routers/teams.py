"""Team router for the Learning Platform service."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from common.auth import decode_token
from common.database import get_db
from common.messaging import RabbitMQClient
from common.models import (
    Course,
    Enrollment,
    Team,
    TeamMembership,
    User,
    UserBadge,
    XPTransaction,
)
from services.learning.teams.activity import TeamActivityService

router = APIRouter(prefix="/teams", tags=["teams"])
security = HTTPBearer()
TEAM_MANAGEMENT_ROLES = {"SuperAdmin", "Admin", "Manager", "TeamManager"}


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate the current user from JWT token."""
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
    """Get User object from JWT payload."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _require_team_management_role(user: User) -> None:
    if user.role not in TEAM_MANAGEMENT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only TeamManager, Manager, Admin, or SuperAdmin can manage teams",
        )


def _enforce_same_tenant(user: User, tenant_id: Optional[UUID], entity: str) -> None:
    if user.role != "SuperAdmin" and tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: {entity} belongs to another tenant",
        )


def _parse_tenant_id(value: Optional[str], field_name: str = "tenant_id") -> Optional[UUID]:
    if not value:
        return None
    try:
        return UUID(str(value))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        ) from exc


def _assert_team_access(user: User, team: Team, write: bool = False) -> None:
    _enforce_same_tenant(user, team.tenant_id, "team")


def _has_team_membership(user: User, team_id: UUID, db: Session) -> bool:
    return (
        db.query(TeamMembership)
        .filter(TeamMembership.team_id == team_id, TeamMembership.user_id == user.id)
        .first()
        is not None
    )


def _assert_team_view_access(user: User, team: Team, db: Session) -> None:
    _enforce_same_tenant(user, team.tenant_id, "team")
    if user.role in TEAM_MANAGEMENT_ROLES:
        _assert_team_access(user, team)
        return
    if not _has_team_membership(user, team.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you are not a member of this team",
        )


def _serialize_team(team: Team) -> dict:
    memberships = list(team.memberships or [])
    return {
        "id": str(team.id),
        "name": team.name,
        "description": team.description,
        "manager_id": str(team.manager_id) if team.manager_id else None,
        "tenant_id": str(team.tenant_id) if team.tenant_id else None,
        "created_at": team.created_at.isoformat(),
        "member_count": len(memberships),
        "memberships": [
            {
                "user_id": str(m.user_id),
                "role": m.role,
                "joined_at": m.joined_at.isoformat(),
                "user_name": _display_name(m.user) if m.user else None,
                "avatar": m.user.avatar if m.user else None,
            }
            for m in memberships
        ],
    }


def _display_name(user: User) -> str:
    full_name = f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
    if full_name:
        return full_name
    if user.email:
        return user.email
    return "Unknown user"


@router.get("/", response_model=list[dict])
def list_teams(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List teams scoped by role and tenant."""
    user_info = _get_user_from_payload(current_user, db)
    query = db.query(Team)

    if user_info.role != "SuperAdmin":
        query = query.filter(Team.tenant_id == user_info.tenant_id)

    if user_info.role not in TEAM_MANAGEMENT_ROLES:
        query = query.join(TeamMembership, TeamMembership.team_id == Team.id).filter(
            TeamMembership.user_id == user_info.id
        )

    teams = query.order_by(Team.created_at.desc()).all()
    return [_serialize_team(team) for team in teams]


@router.get("/available-users", response_model=list[dict])
def list_available_team_users(
    tenant_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List same-tenant users that can be assigned to teams."""
    user_info = _get_user_from_payload(current_user, db)
    _require_team_management_role(user_info)

    scoped_tenant_id = user_info.tenant_id
    if user_info.role == "SuperAdmin":
        scoped_tenant_id = _parse_tenant_id(tenant_id)
        if scoped_tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tenant_id is required for SuperAdmin team user lookup",
            )

    query = db.query(User).filter(User.tenant_id == scoped_tenant_id)
    users = query.order_by(User.first_name.asc(), User.last_name.asc()).all()
    return [
        {
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "display_name": _display_name(user),
            "role": user.role,
            "department": user.department,
            "status": user.status,
        }
        for user in users
        if user.role != "SuperAdmin" and user.status == "active"
    ]


@router.get("/{team_id}", response_model=dict)
def get_team(
    team_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get team by ID with memberships."""
    user_info = _get_user_from_payload(current_user, db)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    _assert_team_view_access(user_info, team, db)
    return _serialize_team(team)


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_team(
    team_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new team within the caller's tenant or selected SuperAdmin tenant."""
    user_info = _get_user_from_payload(current_user, db)
    _require_team_management_role(user_info)

    team_tenant_id = user_info.tenant_id
    if user_info.role == "SuperAdmin":
        team_tenant_id = _parse_tenant_id(team_data.get("tenant_id"))
        if team_tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tenant_id is required when SuperAdmin creates a team",
            )

    manager_id = user_info.id if user_info.role == "TeamManager" else None
    if team_data.get("manager_id"):
        manager_id = UUID(team_data["manager_id"])

    if manager_id:
        manager = db.query(User).filter(User.id == manager_id).first()
        if not manager:
            raise HTTPException(status_code=404, detail="Manager not found")
        _enforce_same_tenant(user_info, manager.tenant_id, "manager")
        if manager.tenant_id != team_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned manager must belong to the selected team tenant",
            )
        if manager.role not in {"Manager", "TeamManager", "Admin"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned manager must have Admin, Manager, or TeamManager role",
            )
    elif user_info.role == "TeamManager":
        manager_id = user_info.id

    team = Team(
        name=team_data["name"],
        description=team_data.get("description"),
        manager_id=manager_id,
        tenant_id=team_tenant_id,
    )
    db.add(team)
    db.commit()
    db.refresh(team)

    return _serialize_team(team)


@router.put("/{team_id}", response_model=dict)
def update_team(
    team_id: UUID,
    team_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a team within the caller's scope."""
    user_info = _get_user_from_payload(current_user, db)
    _require_team_management_role(user_info)

    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    _assert_team_access(user_info, team, write=True)

    if "manager_id" in team_data and team_data["manager_id"] is not None:
        manager_id = UUID(team_data["manager_id"])
        manager = db.query(User).filter(User.id == manager_id).first()
        if not manager:
            raise HTTPException(status_code=404, detail="Manager not found")
        _enforce_same_tenant(user_info, manager.tenant_id, "manager")
        if manager.tenant_id != team.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned manager must belong to the team tenant",
            )
        if manager.role not in {"Manager", "TeamManager", "Admin"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned manager must have Admin, Manager, or TeamManager role",
            )
        team.manager_id = manager_id

    for field in ["name", "description"]:
        if field in team_data and team_data[field] is not None:
            setattr(team, field, team_data[field])

    db.commit()
    db.refresh(team)
    return _serialize_team(team)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a team within the caller's scope."""
    user_info = _get_user_from_payload(current_user, db)
    _require_team_management_role(user_info)

    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    _assert_team_access(user_info, team, write=True)
    db.delete(team)
    db.commit()


@router.post("/{team_id}/members", response_model=dict, status_code=status.HTTP_201_CREATED)
def add_team_member(
    team_id: UUID,
    member_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a same-tenant member to a team."""
    user_info = _get_user_from_payload(current_user, db)
    _require_team_management_role(user_info)

    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    _assert_team_access(user_info, team, write=True)

    user_id = UUID(member_data["user_id"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _enforce_same_tenant(user_info, user.tenant_id, "user")
    if user.tenant_id != team.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to the team tenant",
        )

    existing = (
        db.query(TeamMembership)
        .filter(TeamMembership.team_id == team_id, TeamMembership.user_id == user_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this team",
        )

    membership = TeamMembership(
        user_id=user_id,
        team_id=team_id,
        role=member_data.get("role", "member"),
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)

    try:
        from services.learning.gamification.badges import BadgeManager

        BadgeManager(db, RabbitMQClient()).check_and_award_badges(
            user_id=str(user_id),
            action="team_join",
            count=1,
        )
    except Exception:
        # Team assignment should still succeed even if badge publishing fails.
        pass

    return {
        "id": str(membership.id),
        "user_id": str(membership.user_id),
        "team_id": str(membership.team_id),
        "role": membership.role,
        "joined_at": membership.joined_at.isoformat(),
    }


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_team_member(
    team_id: UUID,
    user_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a member from a team."""
    user_info = _get_user_from_payload(current_user, db)
    _require_team_management_role(user_info)

    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    _assert_team_access(user_info, team, write=True)

    membership = (
        db.query(TeamMembership)
        .filter(
            TeamMembership.team_id == team_id,
            TeamMembership.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    db.delete(membership)
    db.commit()


@router.get("/{team_id}/activity", response_model=list[dict])
def get_team_activity(
    team_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a simple chronological activity feed for a team."""
    user_info = _get_user_from_payload(current_user, db)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    _assert_team_access(user_info, team)

    activity_service = TeamActivityService(db, _display_name)
    return activity_service.get_team_activity(team_id, limit=limit)


@router.post("/{team_id}/courses", response_model=dict)
def assign_course_to_team(
    team_id: UUID,
    assignment_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Assign a course to all team members at once."""
    user_info = _get_user_from_payload(current_user, db)
    _require_team_management_role(user_info)

    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    _assert_team_access(user_info, team, write=True)

    course_id = UUID(assignment_data["course_id"])
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    _enforce_same_tenant(user_info, course.tenant_id, "course")
    if course.tenant_id != team.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Course must belong to the team tenant",
        )

    memberships = db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()
    enrolled_count = 0
    failed_count = 0
    failures = []

    for membership in memberships:
        existing = (
            db.query(Enrollment)
            .filter(
                Enrollment.user_id == membership.user_id,
                Enrollment.course_id == course_id,
            )
            .first()
        )
        if existing:
            failed_count += 1
            failures.append(
                {
                    "user_id": str(membership.user_id),
                    "reason": "Already enrolled",
                }
            )
            continue

        enrollment = Enrollment(
            user_id=membership.user_id,
            course_id=course_id,
            status="in_progress",
        )
        db.add(enrollment)
        enrolled_count += 1

    db.commit()
    return {
        "team_id": str(team_id),
        "course_id": str(course_id),
        "enrolled_count": enrolled_count,
        "failed_count": failed_count,
        "failures": failures,
        "assigned_at": datetime.utcnow().isoformat(),
    }


@router.get("/{team_id}/progress", response_model=dict)
def get_team_progress(
    team_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get progress summary for all team members."""
    user_info = _get_user_from_payload(current_user, db)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    _assert_team_access(user_info, team)

    memberships = db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()
    member_progress = []
    for membership in memberships:
        user = membership.user
        enrollments = db.query(Enrollment).filter(Enrollment.user_id == membership.user_id).all()
        courses_assigned = len(enrollments)
        courses_completed = sum(1 for enrollment in enrollments if enrollment.status == "completed")
        courses_in_progress = sum(1 for enrollment in enrollments if enrollment.status == "in_progress")
        member_progress.append(
            {
                "user_id": str(user.id),
                "user_name": _display_name(user),
                "avatar": user.avatar,
                "role": membership.role,
                "courses_assigned": courses_assigned,
                "courses_completed": courses_completed,
                "courses_in_progress": courses_in_progress,
                "completion_rate": round(courses_completed / courses_assigned * 100, 1)
                if courses_assigned > 0
                else 0,
            }
        )

    return {
        "team_id": str(team_id),
        "team_name": team.name,
        "total_members": len(memberships),
        "members": member_progress,
    }
