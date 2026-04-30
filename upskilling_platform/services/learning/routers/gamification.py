"""Gamification API router."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.messaging import RabbitMQClient
from common.models import User
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
    return result


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
    db: Session = Depends(get_db),
):
    """Get all badge definitions."""
    badge_manager = BadgeManager(db, rabbitmq_client)
    definitions = badge_manager.get_all_badge_definitions()
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
