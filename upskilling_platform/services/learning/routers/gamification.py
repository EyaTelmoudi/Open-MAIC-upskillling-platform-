"""Gamification API router."""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.messaging import RabbitMQClient
from common.models import CustomBadge, User, UserBadge
from services.learning.services.goal_tracking import sync_user_goals
from services.learning.gamification import (
    XPManager,
    LevelManager,
    BadgeManager,
    StreakManager,
    LeaderboardManager,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gamification", tags=["gamification"])

rabbitmq_client = RabbitMQClient()

security = HTTPBearer()


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
    from uuid import UUID
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


class XPAwardRequest(BaseModel):
    action: str
    reason: Optional[str] = None
    multiplier: float = 1.0


class LevelInfoResponse(BaseModel):
    level: int
    total_xp: int
    current_level_xp: int
    next_level_xp: int
    xp_in_level: int
    xp_needed: int
    progress: float
    tier: str


class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    last_activity_date: Optional[str]
    is_active_today: bool


class BadgeResponse(BaseModel):
    badge_id: str
    name: str
    tier: str
    icon: str
    description: str
    earned_at: Optional[str]


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: str
    user_name: str
    avatar: Optional[str]
    total_xp: int
    level: int
    rank_change: int = 0


class UserRankResponse(BaseModel):
    rank: int
    total_xp: int
    level: int


CUSTOM_BADGE_ROLES = {"Admin", "Manager", "LearningExpert", "TeamManager"}
CUSTOM_BADGE_TIERS = {"bronze", "silver", "gold", "platinum"}
CUSTOM_BADGE_CONDITIONS = {
    "challenge_completed",
    "challenge_won",
    "challenge_fast_finish",
    "course_completed",
    "course_category_completed",
    "learning_path_completed",
    "quiz_score",
    "skill_validated",
    "team_participation",
    "streak_days",
    "manual_award",
}
CUSTOM_BADGE_SCOPES_BY_ROLE = {
    "TeamManager": {"tenant", "team", "challenge"},
    "LearningExpert": {"tenant", "course", "category", "skill", "learning_path"},
    "Admin": {"tenant", "team", "challenge", "course", "category", "skill", "learning_path"},
    "Manager": {"tenant", "team", "challenge", "course", "category", "skill", "learning_path"},
}

CUSTOM_BADGE_CONDITION_HINTS = {
    "manual_award": "This badge is awarded manually by an authorized manager or learning expert.",
    "challenge_completed": "Complete the related challenge.",
    "challenge_won": "Win the related challenge.",
    "challenge_fast_finish": "Finish the related challenge before the deadline.",
    "course_completed": "Complete the related course.",
    "course_category_completed": "Complete the required course category.",
    "learning_path_completed": "Complete the related learning path.",
    "quiz_score": "Reach the required quiz score.",
    "skill_validated": "Validate the related skill.",
    "team_participation": "Participate in the related team activity.",
    "streak_days": "Keep the required learning streak.",
}


class CustomBadgeCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    tier: str = "bronze"
    scope_type: str = "tenant"
    scope_id: Optional[str] = None
    condition_type: str
    condition_value: Optional[int] = None
    auto_award: bool = True
    requires_approval: bool = False


class CustomBadgeUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    tier: Optional[str] = None
    scope_type: Optional[str] = None
    scope_id: Optional[str] = None
    condition_type: Optional[str] = None
    condition_value: Optional[int] = None
    auto_award: Optional[bool] = None
    requires_approval: Optional[bool] = None
    is_active: Optional[bool] = None


class CustomBadgeEvaluationRequest(BaseModel):
    event_type: str
    challenge_id: Optional[str] = None
    course_id: Optional[str] = None
    assessment_id: Optional[str] = None
    team_id: Optional[str] = None
    learning_path_id: Optional[str] = None
    skill_id: Optional[str] = None
    completed: bool = False
    won: bool = False
    fast_finish: bool = False
    score: Optional[float] = None
    streak_count: Optional[int] = None
    participation_count: Optional[int] = None


def _require_custom_badge_role(payload: dict, db: Session) -> User:
    user = _get_user_from_payload(payload, db)
    if user.role not in CUSTOM_BADGE_ROLES:
        raise HTTPException(status_code=403, detail="Not allowed to manage badges")
    if not user.tenant_id:
        raise HTTPException(status_code=403, detail="User is not attached to a company")
    return user


def _parse_optional_uuid(value: Optional[str], field_name: str) -> Optional[UUID]:
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")


def _validate_custom_badge_fields(
    *,
    user: User,
    name: Optional[str] = None,
    tier: Optional[str] = None,
    scope_type: Optional[str] = None,
    condition_type: Optional[str] = None,
    condition_value: Optional[int] = None,
) -> dict:
    values = {}

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Badge name is required")
        if len(clean_name) > 120:
            raise HTTPException(status_code=400, detail="Badge name is too long")
        values["name"] = clean_name

    if tier is not None:
        clean_tier = tier.lower().strip()
        if clean_tier not in CUSTOM_BADGE_TIERS:
            raise HTTPException(status_code=400, detail="Invalid badge tier")
        values["tier"] = clean_tier

    if scope_type is not None:
        clean_scope = scope_type.lower().strip()
        allowed_scopes = CUSTOM_BADGE_SCOPES_BY_ROLE.get(user.role, set())
        if clean_scope not in allowed_scopes:
            raise HTTPException(status_code=403, detail="Scope not allowed for this role")
        values["scope_type"] = clean_scope

    if condition_type is not None:
        clean_condition = condition_type.lower().strip()
        if clean_condition not in CUSTOM_BADGE_CONDITIONS:
            raise HTTPException(status_code=400, detail="Invalid badge condition")
        values["condition_type"] = clean_condition

    if condition_value is not None and condition_value < 0:
        raise HTTPException(status_code=400, detail="Condition value must be positive")

    return values


def _serialize_custom_badge(badge: CustomBadge) -> dict:
    return {
        "id": str(badge.id),
        "tenant_id": str(badge.tenant_id),
        "created_by": str(badge.created_by),
        "owner_role": badge.owner_role,
        "scope_type": badge.scope_type,
        "scope_id": str(badge.scope_id) if badge.scope_id else None,
        "name": badge.name,
        "description": badge.description,
        "icon": badge.icon,
        "tier": badge.tier,
        "condition_type": badge.condition_type,
        "condition_value": badge.condition_value,
        "auto_award": badge.auto_award,
        "requires_approval": badge.requires_approval,
        "is_active": badge.is_active,
        "created_at": badge.created_at.isoformat() if badge.created_at else None,
        "updated_at": badge.updated_at.isoformat() if badge.updated_at else None,
    }


def _custom_badge_unlock_hint(badge: CustomBadge) -> str:
    hint = CUSTOM_BADGE_CONDITION_HINTS.get(
        badge.condition_type,
        "Complete the configured badge requirement.",
    )
    if badge.condition_value is not None:
        if badge.condition_type == "quiz_score":
            hint = f"Reach at least {badge.condition_value}% in the related quiz."
        elif badge.condition_type == "streak_days":
            hint = f"Keep learning for {badge.condition_value} consecutive days."
        elif badge.condition_type == "team_participation":
            hint = f"Participate in {badge.condition_value} team activities."
        elif badge.condition_type == "challenge_completed":
            hint = f"Complete the related challenge with a score of at least {badge.condition_value}."
    if badge.requires_approval:
        hint = f"{hint} Approval is required before it appears as earned."
    return hint


def _custom_badge_definition(badge: CustomBadge) -> dict:
    return {
        "badge_id": f"custom:{badge.id}",
        "name": badge.name,
        "tier": badge.tier,
        "icon": badge.icon or "award",
        "description": badge.description or "",
        "unlock_hint": _custom_badge_unlock_hint(badge),
        "condition_type": badge.condition_type,
        "condition_value": badge.condition_value,
        "scope_type": badge.scope_type,
        "scope_id": str(badge.scope_id) if badge.scope_id else None,
        "auto_award": badge.auto_award,
        "requires_approval": badge.requires_approval,
        "earned_at": None,
    }


def _get_tenant_custom_badge_definitions(db: Session, tenant_id: UUID) -> list[dict]:
    badges = (
        db.query(CustomBadge)
        .filter(CustomBadge.tenant_id == tenant_id, CustomBadge.is_active.is_(True))
        .order_by(CustomBadge.created_at.desc())
        .all()
    )
    return [_custom_badge_definition(badge) for badge in badges]


def _numeric_condition_value(value: object) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _custom_badge_scope_matches(
    badge: CustomBadge,
    request: CustomBadgeEvaluationRequest,
) -> bool:
    if not badge.scope_id:
        return badge.scope_type in {"tenant", "company-wide"}

    scope_id = str(badge.scope_id)
    if badge.scope_type == "challenge":
        return scope_id == str(request.challenge_id or "")
    if badge.scope_type == "course":
        return scope_id == str(request.course_id or "")
    if badge.scope_type == "team":
        return scope_id == str(request.team_id or "")
    if badge.scope_type == "learning_path":
        return scope_id == str(request.learning_path_id or "")
    if badge.scope_type == "skill":
        return scope_id == str(request.skill_id or "")
    return badge.scope_type in {"tenant", "company-wide"}


def _custom_badge_condition_matches(
    badge: CustomBadge,
    request: CustomBadgeEvaluationRequest,
) -> bool:
    condition = badge.condition_type
    event = request.event_type
    score = request.score
    required_score = _numeric_condition_value(badge.condition_value)

    if condition == "challenge_completed":
        if event not in {"challenge.completed", "solo_challenge.completed"} or not request.completed:
            return False
        return required_score is None or (score is not None and score >= required_score)

    if condition == "challenge_won":
        return event in {"challenge.completed", "solo_challenge.completed"} and request.won

    if condition == "challenge_fast_finish":
        return event in {"challenge.completed", "solo_challenge.completed"} and request.fast_finish

    if condition == "course_completed":
        return event == "course.completed" and request.completed

    if condition == "quiz_score":
        return event in {"assessment.submitted", "quiz.submitted"} and (
            score is not None
            and required_score is not None
            and score >= required_score
        )

    if condition == "streak_days":
        return event == "streak.update" and (
            request.streak_count is not None
            and required_score is not None
            and request.streak_count >= required_score
        )

    if condition == "team_participation":
        return event in {"team.participation", "team.member.added"} and (
            required_score is None
            or (
                request.participation_count is not None
                and request.participation_count >= required_score
            )
        )

    if condition == "learning_path_completed":
        return event == "learning_path.completed" and request.completed

    if condition == "skill_validated":
        return event == "skill.validated" and request.completed

    return False


def _publish_custom_badge_event(user_id: str, badge_id: str, badge: CustomBadge) -> None:
    event = {
        "event": "badge.earned",
        "userId": user_id,
        "badge_id": badge_id,
        "badge_name": badge.name,
        "tier": badge.tier,
        "icon": badge.icon or "award",
        "timestamp": datetime.utcnow().isoformat(),
    }
    try:
        rabbitmq_client.publish(
            exchange="learning.exchange",
            routing_key="learning.gamification",
            message=event,
        )
    except Exception as exc:
        logger.error("Failed to publish custom badge event: %s", exc)


def _award_custom_badge_if_needed(db: Session, user_id: str, badge: CustomBadge) -> Optional[dict]:
    badge_id = f"custom:{badge.id}"
    existing = (
        db.query(UserBadge)
        .filter(UserBadge.user_id == UUID(user_id), UserBadge.badge_id == badge_id)
        .first()
    )
    if existing:
        return None

    user_badge = UserBadge(
        user_id=UUID(user_id),
        badge_id=badge_id,
        badge_name=badge.name,
        badge_tier=badge.tier,
        badge_icon=badge.icon or "award",
        description=badge.description,
    )
    db.add(user_badge)
    db.commit()
    _publish_custom_badge_event(user_id, badge_id, badge)
    return {
        "badge_id": badge_id,
        "name": badge.name,
        "tier": badge.tier,
        "icon": badge.icon or "award",
    }


def evaluate_custom_badges_for_user(
    db: Session,
    *,
    user_id: str,
    event_type: str,
    challenge_id: Optional[str] = None,
    course_id: Optional[str] = None,
    assessment_id: Optional[str] = None,
    team_id: Optional[str] = None,
    learning_path_id: Optional[str] = None,
    skill_id: Optional[str] = None,
    completed: bool = False,
    won: bool = False,
    fast_finish: bool = False,
    score: Optional[float] = None,
    streak_count: Optional[int] = None,
    participation_count: Optional[int] = None,
) -> list[dict]:
    """Evaluate active tenant custom badges for a real platform event."""
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user or not user.tenant_id:
        return []

    request = CustomBadgeEvaluationRequest(
        event_type=event_type,
        challenge_id=challenge_id,
        course_id=course_id,
        assessment_id=assessment_id,
        team_id=team_id,
        learning_path_id=learning_path_id,
        skill_id=skill_id,
        completed=completed,
        won=won,
        fast_finish=fast_finish,
        score=score,
        streak_count=streak_count,
        participation_count=participation_count,
    )

    badges = (
        db.query(CustomBadge)
        .filter(
            CustomBadge.tenant_id == user.tenant_id,
            CustomBadge.is_active.is_(True),
            CustomBadge.auto_award.is_(True),
            CustomBadge.requires_approval.is_(False),
        )
        .all()
    )

    awarded: list[dict] = []
    for badge in badges:
        if not _custom_badge_scope_matches(badge, request):
            continue
        if not _custom_badge_condition_matches(badge, request):
            continue
        result = _award_custom_badge_if_needed(db, str(user.id), badge)
        if result:
            awarded.append(result)

    return awarded


@router.get("/xp")
async def get_user_xp(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get total XP for the current user."""
    user_id = current_user["sub"]
    xp_manager = XPManager(db, rabbitmq_client)
    total_xp = xp_manager.get_total_xp(str(user_id))
    return {"total_xp": total_xp}


@router.get("/xp/history")
async def get_xp_history(
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get XP transaction history."""
    user_id = current_user["sub"]
    xp_manager = XPManager(db, rabbitmq_client)
    transactions = xp_manager.get_xp_history(str(user_id), limit, offset)

    return {
        "transactions": [
            {
                "id": str(t.id),
                "amount": t.amount,
                "reason": t.reason,
                "created_at": t.created_at.isoformat(),
            }
            for t in transactions
        ]
    }


@router.post("/xp")
async def award_xp(
    request: XPAwardRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Award XP to the current user."""
    user = _get_user_from_payload(current_user, db)
    user_id = current_user["sub"]
    xp_manager = XPManager(db, rabbitmq_client)
    transaction = xp_manager.award_xp(
        user_id=str(user_id),
        action=request.action,
        reason=request.reason,
        multiplier=request.multiplier,
        user_timezone=user.timezone,
    )

    if transaction is None:
        raise HTTPException(status_code=400, detail="Failed to award XP")

    level_manager = LevelManager(db, rabbitmq_client)
    level_up = level_manager.check_level_up(str(user_id))

    response = {
        "amount": transaction.amount,
        "reason": transaction.reason,
    }

    if level_up:
        response["level_up"] = level_up

    sync_user_goals(db, UUID(user_id))

    return response


@router.get("/level")
async def get_level_info(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get detailed level information for the current user."""
    user_id = current_user["sub"]
    level_manager = LevelManager(db, rabbitmq_client)
    level_info = level_manager.get_level_info(str(user_id))
    return level_info


@router.get("/streak")
async def get_streak(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get streak information for the current user."""
    user = _get_user_from_payload(current_user, db)
    user_id = current_user["sub"]
    streak_manager = StreakManager(db, rabbitmq_client)
    streak_info = streak_manager.get_streak_info(str(user_id), user.timezone)
    return streak_info


@router.post("/streak/activity")
async def record_activity(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record user activity for streak tracking."""
    user = _get_user_from_payload(current_user, db)
    user_id = current_user["sub"]
    streak_manager = StreakManager(db, rabbitmq_client)
    result = streak_manager.record_activity(str(user_id), user.timezone)
    sync_user_goals(db, UUID(user_id))
    return result


@router.get("/custom-badges")
async def list_custom_badges(
    include_inactive: bool = False,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List custom badges for the current user's company only."""
    user = _require_custom_badge_role(current_user, db)
    query = db.query(CustomBadge).filter(CustomBadge.tenant_id == user.tenant_id)
    if not include_inactive:
        query = query.filter(CustomBadge.is_active.is_(True))
    badges = query.order_by(CustomBadge.created_at.desc()).all()
    return {"badges": [_serialize_custom_badge(badge) for badge in badges]}


@router.post("/custom-badges")
async def create_custom_badge(
    request: CustomBadgeCreateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a tenant-scoped badge definition."""
    user = _require_custom_badge_role(current_user, db)
    values = _validate_custom_badge_fields(
        user=user,
        name=request.name,
        tier=request.tier,
        scope_type=request.scope_type,
        condition_type=request.condition_type,
        condition_value=request.condition_value,
    )
    badge = CustomBadge(
        tenant_id=user.tenant_id,
        created_by=user.id,
        owner_role=user.role,
        scope_id=_parse_optional_uuid(request.scope_id, "scope_id"),
        description=request.description.strip() if request.description else None,
        icon=(request.icon or "award").strip()[:20],
        condition_value=request.condition_value,
        auto_award=request.auto_award,
        requires_approval=request.requires_approval,
        **values,
    )
    db.add(badge)
    db.commit()
    db.refresh(badge)
    return _serialize_custom_badge(badge)


@router.put("/custom-badges/{badge_id}")
async def update_custom_badge(
    badge_id: UUID,
    request: CustomBadgeUpdateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a custom badge inside the current user's company."""
    user = _require_custom_badge_role(current_user, db)
    badge = (
        db.query(CustomBadge)
        .filter(CustomBadge.id == badge_id, CustomBadge.tenant_id == user.tenant_id)
        .first()
    )
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")

    values = _validate_custom_badge_fields(
        user=user,
        name=request.name,
        tier=request.tier,
        scope_type=request.scope_type,
        condition_type=request.condition_type,
        condition_value=request.condition_value,
    )
    for field, value in values.items():
        setattr(badge, field, value)

    if request.description is not None:
        badge.description = request.description.strip() or None
    if request.icon is not None:
        badge.icon = (request.icon or "award").strip()[:20]
    if request.scope_id is not None:
        badge.scope_id = _parse_optional_uuid(request.scope_id, "scope_id")
    if request.condition_value is not None:
        badge.condition_value = request.condition_value
    if request.auto_award is not None:
        badge.auto_award = request.auto_award
    if request.requires_approval is not None:
        badge.requires_approval = request.requires_approval
    if request.is_active is not None:
        badge.is_active = request.is_active

    db.commit()
    db.refresh(badge)
    return _serialize_custom_badge(badge)


@router.delete("/custom-badges/{badge_id}")
async def deactivate_custom_badge(
    badge_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deactivate a custom badge inside the current user's company."""
    user = _require_custom_badge_role(current_user, db)
    badge = (
        db.query(CustomBadge)
        .filter(CustomBadge.id == badge_id, CustomBadge.tenant_id == user.tenant_id)
        .first()
    )
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    badge.is_active = False
    db.commit()
    return {"ok": True}


@router.post("/custom-badges/evaluate")
async def evaluate_custom_badges(
    request: CustomBadgeEvaluationRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Evaluate tenant custom badges for the current user after a learning event."""
    user = _get_user_from_payload(current_user, db)
    if not user.tenant_id:
        return {"awarded": []}

    awarded = evaluate_custom_badges_for_user(
        db,
        user_id=str(user.id),
        event_type=request.event_type,
        challenge_id=request.challenge_id,
        course_id=request.course_id,
        assessment_id=request.assessment_id,
        team_id=request.team_id,
        learning_path_id=request.learning_path_id,
        skill_id=request.skill_id,
        completed=request.completed,
        won=request.won,
        fast_finish=request.fast_finish,
        score=request.score,
        streak_count=request.streak_count,
        participation_count=request.participation_count,
    )
    return {"awarded": awarded}


@router.get("/badges")
async def get_badges(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all badges for the current user."""
    user_id = current_user["sub"]
    badge_manager = BadgeManager(db, rabbitmq_client)
    user_badges = badge_manager.get_user_badges(str(user_id))
    return {"badges": user_badges}


@router.get("/badges/definitions")
async def get_badge_definitions(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get static and tenant custom badge definitions."""
    user = _get_user_from_payload(current_user, db)
    badge_manager = BadgeManager(db, rabbitmq_client)
    definitions = badge_manager.get_all_badge_definitions()
    if user.tenant_id:
        definitions = definitions + _get_tenant_custom_badge_definitions(db, user.tenant_id)
    return {"badges": definitions}


@router.get("/profile")
async def get_gamification_profile(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get complete gamification profile for the current user."""
    user = _get_user_from_payload(current_user, db)
    user_id = current_user["sub"]
    xp_manager = XPManager(db, rabbitmq_client)
    level_manager = LevelManager(db, rabbitmq_client)
    streak_manager = StreakManager(db, rabbitmq_client)
    badge_manager = BadgeManager(db, rabbitmq_client)
    leaderboard_manager = LeaderboardManager(db)

    total_xp = xp_manager.get_total_xp(str(user_id))
    level_info = level_manager.get_level_info(str(user_id))
    streak_info = streak_manager.get_streak_info(str(user_id), user.timezone)
    user_badges = badge_manager.get_user_badges(str(user_id))
    user_rank = leaderboard_manager.get_user_rank(str(user_id))

    if user_rank and user_rank.get("rank", 999999) <= 10:
        badge_manager.check_and_award_badges(
            user_id=str(user_id),
            action="leaderboard_rank",
            count=10,
        )
        user_badges = badge_manager.get_user_badges(str(user_id))

    all_definitions = badge_manager.get_all_badge_definitions()
    if user.tenant_id:
        all_definitions = all_definitions + _get_tenant_custom_badge_definitions(
            db, user.tenant_id
        )
    unlocked_ids = {b["badge_id"] for b in user_badges}

    all_badges = [
        {**defn, "unlocked": defn["badge_id"] in unlocked_ids}
        for defn in all_definitions
    ]

    return {
        "xp": {"total": total_xp},
        "level": level_info,
        "streak": streak_info,
        "badges": {"user": user_badges, "all": all_badges},
        "rank": user_rank,
    }


@router.get("/leaderboard")
async def get_leaderboard(
    type: str = "global",
    team_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get leaderboard by type. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)
    leaderboard_manager = LeaderboardManager(db)
    user_timezone = user_info.timezone

    if type == "global":
        if user_info.role == "SuperAdmin":
            entries = leaderboard_manager.get_global_leaderboard(limit, offset)
        else:
            entries = leaderboard_manager.get_tenant_leaderboard(
                str(user_info.tenant_id), limit, offset
            )
    elif type == "weekly":
        if user_info.role == "SuperAdmin":
            entries = leaderboard_manager.get_weekly_leaderboard(
                limit,
                offset,
                user_timezone,
            )
        else:
            entries = leaderboard_manager.get_tenant_weekly_leaderboard(
                str(user_info.tenant_id),
                limit,
                offset,
                user_timezone,
            )
    elif type == "monthly":
        if user_info.role == "SuperAdmin":
            entries = leaderboard_manager.get_monthly_leaderboard(
                limit,
                offset,
                user_timezone,
            )
        else:
            entries = leaderboard_manager.get_tenant_monthly_leaderboard(
                str(user_info.tenant_id),
                limit,
                offset,
                user_timezone,
            )
    elif type == "team":
        if not team_id:
            raise HTTPException(status_code=400, detail="team_id required")
        entries = leaderboard_manager.get_team_leaderboard(team_id, limit, offset)
    else:
        raise HTTPException(status_code=400, detail="Invalid leaderboard type")

    return {"leaderboard": entries, "type": type}


@router.get("/leaderboard/me")
async def get_my_rank(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current user's rank on the leaderboard. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)
    user_id = current_user["sub"]
    leaderboard_manager = LeaderboardManager(db)

    if user_info.role == "SuperAdmin":
        rank = leaderboard_manager.get_user_rank(str(user_id))
    else:
        rank = leaderboard_manager.get_user_rank_by_tenant(
            str(user_id), str(user_info.tenant_id)
        )

    if not rank:
        raise HTTPException(status_code=404, detail="User not found on leaderboard")

    if rank.get("rank", 999999) <= 10:
        BadgeManager(db, rabbitmq_client).check_and_award_badges(
            user_id=str(user_id),
            action="leaderboard_rank",
            count=10,
        )

    return rank
