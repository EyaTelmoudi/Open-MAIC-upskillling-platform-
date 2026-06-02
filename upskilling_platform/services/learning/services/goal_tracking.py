"""Automatic goal synchronization based on real learner activity."""

from __future__ import annotations

import logging
from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from common.models import Enrollment, TeamGoal, TeamMembership, User, UserGoal, UserProgress, UserStreak
from services.learning.gamification.xp import XPManager
from services.learning.gamification.streaks import StreakManager

logger = logging.getLogger(__name__)

GOAL_META_PREFIX = "[[SF_GOAL:"
AUTO_GOAL_TYPES = {
    "lessons_completed",
    "courses_completed",
    "study_minutes",
    "xp_earned",
    "streak_days",
}


def _target_count(goal) -> int:
    return max(int(getattr(goal, "target_count", 1) or 1), 1)


def parse_goal_description(
    raw_description: Optional[str],
) -> Tuple[str, Optional[str], bool]:
    """Decode the stored goal metadata."""
    if not raw_description:
        return "manual", None, False

    trimmed = raw_description.strip()
    if not trimmed.startswith(GOAL_META_PREFIX):
        return "manual", trimmed or None, False

    closing_index = trimmed.find("]]")
    if closing_index == -1:
        return "manual", trimmed or None, False

    metadata = trimmed[len(GOAL_META_PREFIX) : closing_index]
    cleaned_description = trimmed[closing_index + 2 :].strip() or None
    goal_type = metadata.replace("type=", "").strip()
    if goal_type not in AUTO_GOAL_TYPES:
        goal_type = "manual"

    return goal_type, cleaned_description, goal_type != "manual"


def serialize_goal_description(description: Optional[str], goal_type: str) -> Optional[str]:
    """Store goal type metadata alongside the human-readable description."""
    trimmed = (description or "").strip()
    if goal_type == "manual":
        return trimmed or None
    prefix = f"{GOAL_META_PREFIX}type={goal_type}]]"
    return f"{prefix}\n{trimmed}" if trimmed else prefix


def _user_metric_value(
    db: Session,
    user_id: UUID,
    goal_type: str,
    *,
    user_timezone: Optional[str],
) -> int:
    if goal_type == "lessons_completed":
        return (
            db.query(UserProgress)
            .filter(UserProgress.user_id == user_id, UserProgress.status == "completed")
            .count()
        )

    if goal_type == "courses_completed":
        return (
            db.query(Enrollment)
            .filter(Enrollment.user_id == user_id, Enrollment.status == "completed")
            .count()
        )

    if goal_type == "study_minutes":
        total_seconds = (
            db.query(UserProgress)
            .filter(UserProgress.user_id == user_id)
            .with_entities(UserProgress.time_spent)
            .all()
        )
        return max(0, round(sum(int(row[0] or 0) for row in total_seconds) / 60))

    if goal_type == "xp_earned":
        return int(XPManager(db).get_total_xp(str(user_id)))

    if goal_type == "streak_days":
        streak = db.query(UserStreak).filter(UserStreak.user_id == user_id).first()
        if streak:
            return int(streak.current_streak or 0)
        return int(
            StreakManager(db).get_streak_info(str(user_id), user_timezone or None).get(
                "current_streak", 0
            )
        )

    return 0


def _team_metric_value(db: Session, member_ids: list[UUID], goal_type: str) -> int:
    if not member_ids:
        return 0

    if goal_type == "lessons_completed":
        return (
            db.query(UserProgress)
            .filter(
                UserProgress.user_id.in_(member_ids),
                UserProgress.status == "completed",
            )
            .count()
        )

    if goal_type == "courses_completed":
        return (
            db.query(Enrollment)
            .filter(
                Enrollment.user_id.in_(member_ids),
                Enrollment.status == "completed",
            )
            .count()
        )

    if goal_type == "study_minutes":
        progress_rows = (
            db.query(UserProgress.time_spent)
            .filter(UserProgress.user_id.in_(member_ids))
            .all()
        )
        return max(0, round(sum(int(row[0] or 0) for row in progress_rows) / 60))

    if goal_type == "xp_earned":
        total = 0
        for member_id in member_ids:
            total += int(XPManager(db).get_total_xp(str(member_id)))
        return total

    if goal_type == "streak_days":
        streaks = (
            db.query(UserStreak.current_streak)
            .filter(UserStreak.user_id.in_(member_ids))
            .all()
        )
        return max((int(row[0] or 0) for row in streaks), default=0)

    return 0


def _award_goal_reward(db: Session, goal: UserGoal) -> None:
    reward = int(goal.xp_reward or 0)
    if reward <= 0:
        return

    reason = f"Goal completed: {goal.title} ({goal.id})"
    # XPManager already guards against duplicate rewards by reason, so reuse it.
    XPManager(db).award_xp(
        user_id=str(goal.user_id),
        action="manual_goal",
        reason=reason,
        explicit_amount=reward,
    )


def _sync_personal_goals(
    db: Session,
    user: User,
    *,
    award_rewards: bool,
) -> dict:
    changed_goals: list[tuple[UserGoal, int, str]] = []
    completed_before_reward: list[UserGoal] = []

    goals = db.query(UserGoal).filter(UserGoal.user_id == user.id).all()
    for goal in goals:
        goal_type, _, is_auto = parse_goal_description(goal.description)
        if not is_auto or goal_type == "manual":
            continue

        current_progress = _user_metric_value(
            db,
            user.id,
            goal_type,
            user_timezone=getattr(user, "timezone", None),
        )
        target_count = _target_count(goal)
        new_status = "completed" if current_progress >= target_count else "active"
        if current_progress != int(goal.progress or 0) or new_status != goal.status:
            was_completed = goal.status == "completed"
            goal.progress = current_progress
            goal.status = new_status
            changed_goals.append((goal, current_progress, new_status))
            if new_status == "completed" and not was_completed:
                completed_before_reward.append(goal)

    team_ids = [
        row[0]
        for row in db.query(TeamMembership.team_id)
        .filter(TeamMembership.user_id == user.id)
        .all()
    ]
    if team_ids:
        team_goals = (
            db.query(TeamGoal)
            .filter(TeamGoal.team_id.in_(team_ids))
            .all()
        )
        for goal in team_goals:
            goal_type, _, is_auto = parse_goal_description(goal.description)
            if not is_auto or goal_type == "manual":
                continue
            member_ids = [
                row[0]
                for row in db.query(TeamMembership.user_id)
                .filter(TeamMembership.team_id == goal.team_id)
                .all()
            ]
            current_progress = _team_metric_value(db, member_ids, goal_type)
            target_count = _target_count(goal)
            new_status = "completed" if current_progress >= target_count else "active"
            if current_progress != int(goal.progress or 0) or new_status != goal.status:
                goal.progress = current_progress
                goal.status = new_status
                changed_goals.append((goal, current_progress, new_status))

    if changed_goals:
        db.commit()
        logger.info(
            "[Goal Sync] Updated %s goal records for user %s.",
            len(changed_goals),
            user.id,
        )

    if award_rewards and completed_before_reward:
        for goal in completed_before_reward:
            _award_goal_reward(db, goal)
        logger.info(
            "[Goal Sync] Awarded rewards for %s completed goals for user %s.",
            len(completed_before_reward),
            user.id,
        )
        return _sync_personal_goals(db, user, award_rewards=False)

    return {
        "updated_goals": len(changed_goals),
        "rewarded_goals": len(completed_before_reward),
    }


def _sync_team_goals_for_team(db: Session, team_id: UUID) -> int:
    team_goals = db.query(TeamGoal).filter(TeamGoal.team_id == team_id).all()
    if not team_goals:
        return 0

    member_ids = [
        row[0]
        for row in db.query(TeamMembership.user_id)
        .filter(TeamMembership.team_id == team_id)
        .all()
    ]

    updated = 0
    for goal in team_goals:
        goal_type, _, is_auto = parse_goal_description(goal.description)
        if not is_auto or goal_type == "manual":
            continue

        current_progress = _team_metric_value(db, member_ids, goal_type)
        target_count = _target_count(goal)
        new_status = "completed" if current_progress >= target_count else "active"
        if current_progress != int(goal.progress or 0) or new_status != goal.status:
            goal.progress = current_progress
            goal.status = new_status
            updated += 1

    if updated:
        db.commit()
        logger.info(
            "[Goal Sync] Updated %s team goal records for team %s.",
            updated,
            team_id,
        )

    return updated


def sync_user_goals(db: Session, user_id: UUID) -> dict:
    """Synchronize personal and team goal progress from real learner activity."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"updated_goals": 0, "rewarded_goals": 0}

    return _sync_personal_goals(db, user, award_rewards=True)


def sync_team_goals(db: Session, team_id: UUID) -> dict:
    """Synchronize a specific team goal set from the current team activity."""
    return {"updated_goals": _sync_team_goals_for_team(db, team_id)}
