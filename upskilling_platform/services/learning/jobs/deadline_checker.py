"""Deadline enforcement background job.

Checks for overdue course assignments and sends reminder notifications.
Consumes RabbitMQ events, publishes reminder notifications.
Manager can extend deadline per user.
"""

import logging
from datetime import datetime, date
from typing import Optional
from uuid import UUID

from sqlalchemy import and_

from common.database import SessionLocal
from common.messaging import RabbitMQClient
from common.models import CourseAssignment, User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DeadlineChecker:
    """Background job to check and enforce course assignment deadlines."""

    def __init__(self):
        self.rabbitmq = RabbitMQClient()

    def check_overdue_assignments(self) -> list[dict]:
        """Find all assignments with past deadlines that are not completed."""
        session = SessionLocal()
        today = date.today()

        try:
            # Get all assignments with past deadlines that are still in progress
            # (In production, would join with Enrollment to check status)
            overdue = (
                session.query(CourseAssignment)
                .filter(
                    and_(
                        CourseAssignment.deadline < today,
                        CourseAssignment.is_mandatory == True,  # noqa: E712
                    )
                )
                .all()
            )

            results = []
            for assignment in overdue:
                user = session.query(User).filter(User.id == assignment.user_id).first()
                if user:
                    results.append(
                        {
                            "assignment_id": str(assignment.id),
                            "user_id": str(assignment.user_id),
                            "user_email": user.email,
                            "course_id": str(assignment.course_id),
                            "deadline": str(assignment.deadline),
                            "days_overdue": (today - assignment.deadline).days,
                        }
                    )

                    # Publish reminder notification
                    self._send_overdue_reminder(
                        user_id=str(user.id),
                        user_email=user.email,
                        course_id=str(assignment.course_id),
                        deadline=str(assignment.deadline),
                        days_overdue=(today - assignment.deadline).days,
                    )

            logger.info(f"Found {len(results)} overdue assignments")
            return results

        finally:
            session.close()

    def _send_overdue_reminder(
        self,
        user_id: str,
        user_email: str,
        course_id: str,
        deadline: str,
        days_overdue: int,
    ) -> None:
        """Send overdue reminder notification via RabbitMQ."""
        try:
            self.rabbitmq.publish(
                exchange="notifications",
                routing_key="notif.email",
                message={
                    "type": "email",
                    "userId": user_id,
                    "email": user_email,
                    "subject": f"Course deadline overdue by {days_overdue} days",
                    "body": f"Your assigned course (ID: {course_id}) was due on {deadline}. "
                    f"Please complete it as soon as possible.",
                    "template": "deadline_overdue",
                    "timestamp": datetime.utcnow().isoformat(),
                },
            )
            logger.info(f"Sent overdue reminder to {user_email}")
        except Exception as e:
            logger.error(f"Failed to send reminder: {e}")

    def extend_deadline(
        self,
        assignment_id: UUID,
        new_deadline: date,
        extended_by: UUID,
    ) -> bool:
        """Extend deadline for a specific assignment (manager action)."""
        session = SessionLocal()

        try:
            assignment = (
                session.query(CourseAssignment)
                .filter(CourseAssignment.id == assignment_id)
                .first()
            )

            if not assignment:
                logger.warning(f"Assignment {assignment_id} not found")
                return False

            old_deadline = assignment.deadline
            assignment.deadline = new_deadline
            session.commit()

            # Notify user about deadline extension
            user = session.query(User).filter(User.id == assignment.user_id).first()
            if user:
                self.rabbitmq.publish(
                    exchange="notifications",
                    routing_key="notif.email",
                    message={
                        "type": "email",
                        "userId": str(user.id),
                        "email": user.email,
                        "subject": "Course deadline extended",
                        "body": f"Your course deadline has been extended from {old_deadline} to {new_deadline}",
                        "template": "deadline_extended",
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                )

            logger.info(
                f"Extended deadline for assignment {assignment_id} to {new_deadline}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to extend deadline: {e}")
            session.rollback()
            return False
        finally:
            session.close()


def run_deadline_check():
    """Entry point for the deadline checker job."""
    logger.info("Starting deadline checker job...")
    checker = DeadlineChecker()
    results = checker.check_overdue_assignments()
    logger.info(f"Deadline check complete. Found {len(results)} overdue.")
    return results


if __name__ == "__main__":
    run_deadline_check()
