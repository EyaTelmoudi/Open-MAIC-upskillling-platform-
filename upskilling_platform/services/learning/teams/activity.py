"""Team activity aggregation service."""

from sqlalchemy.orm import Session

from common.models import Course, Enrollment, TeamMembership, User, UserBadge, XPTransaction


class TeamActivityService:
    """Build a chronological team activity feed from persisted learning events."""

    def __init__(self, db: Session, display_name_resolver):
        self.db = db
        self.display_name = display_name_resolver

    def get_team_activity(self, team_id, limit: int = 20) -> list[dict]:
        memberships = (
            self.db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()
        )
        member_ids = [membership.user_id for membership in memberships]
        if not member_ids:
            return []

        activities = []
        activities.extend(self._enrollment_events(member_ids))
        activities.extend(self._xp_events(member_ids))
        activities.extend(self._badge_events(member_ids))
        activities.sort(key=lambda item: item["timestamp"], reverse=True)
        return activities[:limit]

    def _enrollment_events(self, member_ids: list) -> list[dict]:
        activities = []
        enrollments = self.db.query(Enrollment).filter(Enrollment.user_id.in_(member_ids)).all()
        for enrollment in enrollments:
            user = self.db.query(User).filter(User.id == enrollment.user_id).first()
            course = self.db.query(Course).filter(Course.id == enrollment.course_id).first()
            activities.append(
                {
                    "type": "course_enrollment",
                    "timestamp": enrollment.enrolled_at.isoformat(),
                    "user_id": str(enrollment.user_id),
                    "user_name": self.display_name(user) if user else "Unknown user",
                    "message": f"enrolled in {course.title if course else 'a course'}",
                }
            )
        return activities

    def _xp_events(self, member_ids: list) -> list[dict]:
        activities = []
        xp_events = self.db.query(XPTransaction).filter(XPTransaction.user_id.in_(member_ids)).all()
        for xp_event in xp_events:
            user = self.db.query(User).filter(User.id == xp_event.user_id).first()
            activities.append(
                {
                    "type": "xp_gained",
                    "timestamp": xp_event.created_at.isoformat(),
                    "user_id": str(xp_event.user_id),
                    "user_name": self.display_name(user) if user else "Unknown user",
                    "message": f"earned {xp_event.amount} XP for {xp_event.reason}",
                }
            )
        return activities

    def _badge_events(self, member_ids: list) -> list[dict]:
        activities = []
        badges = self.db.query(UserBadge).filter(UserBadge.user_id.in_(member_ids)).all()
        for badge in badges:
            user = self.db.query(User).filter(User.id == badge.user_id).first()
            activities.append(
                {
                    "type": "badge_earned",
                    "timestamp": badge.earned_at.isoformat(),
                    "user_id": str(badge.user_id),
                    "user_name": self.display_name(user) if user else "Unknown user",
                    "message": f"earned the {badge.badge_name} badge",
                }
            )
        return activities
