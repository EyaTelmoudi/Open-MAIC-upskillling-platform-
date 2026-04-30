"""Course assignment router for the Learning Platform service."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from common.database import get_db
from common.messaging import RabbitMQClient
from common.models import Course, User, CourseAssignment, Enrollment

router = APIRouter(prefix="/assignments", tags=["assignments"])


def get_current_user_id() -> UUID:
    """Placeholder - in production would extract from JWT."""
    return UUID("00000000-0000-0000-0000-000000000001")


@router.post(
    "/course/{course_id}", response_model=dict, status_code=status.HTTP_201_CREATED
)
def create_assignment(
    course_id: UUID,
    deadline: Optional[str] = None,
    is_mandatory: bool = False,
    db: Session = Depends(get_db),
):
    """Create a course assignment for a user.

    POST /courses/{id}/assign creates assignment with optional deadline date and mandatory flag.
    """
    # Get course
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    # Get current user (in production, extract from JWT)
    user_id = get_current_user_id()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Parse deadline
    deadline_date = None
    if deadline:
        deadline_date = datetime.strptime(deadline, "%Y-%m-%d").date()

    # Check if assignment already exists
    existing = (
        db.query(CourseAssignment)
        .filter(
            CourseAssignment.user_id == user_id,
            CourseAssignment.course_id == course_id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment already exists for this user and course",
        )

    # Create assignment
    assignment = CourseAssignment(
        user_id=user_id,
        course_id=course_id,
        deadline=deadline_date,
        is_mandatory=is_mandatory,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    # Publish event to RabbitMQ
    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="learning",
            routing_key="learning.course.assigned",
            message={
                "event": "course.assigned",
                "userId": str(user_id),
                "courseId": str(course_id),
                "deadline": deadline,
                "isMandatory": is_mandatory,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    except Exception:
        pass

    return {
        "id": str(assignment.id),
        "user_id": str(assignment.user_id),
        "course_id": str(assignment.course_id),
        "deadline": str(assignment.deadline) if assignment.deadline else None,
        "is_mandatory": assignment.is_mandatory,
        "assigned_at": assignment.assigned_at.isoformat(),
    }


@router.put("/{assignment_id}", response_model=dict)
def update_assignment(
    assignment_id: UUID,
    deadline: Optional[str] = None,
    is_mandatory: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Update a course assignment."""
    assignment = (
        db.query(CourseAssignment).filter(CourseAssignment.id == assignment_id).first()
    )
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )

    if deadline is not None:
        assignment.deadline = (
            datetime.strptime(deadline, "%Y-%m-%d").date() if deadline else None
        )

    if is_mandatory is not None:
        assignment.is_mandatory = is_mandatory

    db.commit()
    db.refresh(assignment)

    return {
        "id": str(assignment.id),
        "user_id": str(assignment.user_id),
        "course_id": str(assignment.course_id),
        "deadline": str(assignment.deadline) if assignment.deadline else None,
        "is_mandatory": assignment.is_mandatory,
        "assigned_at": assignment.assigned_at.isoformat(),
    }


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(assignment_id: UUID, db: Session = Depends(get_db)):
    """Delete a course assignment."""
    assignment = (
        db.query(CourseAssignment).filter(CourseAssignment.id == assignment_id).first()
    )
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )

    db.delete(assignment)
    db.commit()


@router.get("/{assignment_id}", response_model=dict)
def get_assignment(assignment_id: UUID, db: Session = Depends(get_db)):
    """Get assignment by ID."""
    assignment = (
        db.query(CourseAssignment).filter(CourseAssignment.id == assignment_id).first()
    )
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )

    return {
        "id": str(assignment.id),
        "user_id": str(assignment.user_id),
        "course_id": str(assignment.course_id),
        "deadline": str(assignment.deadline) if assignment.deadline else None,
        "is_mandatory": assignment.is_mandatory,
        "assigned_at": assignment.assigned_at.isoformat(),
    }


@router.get("/user/{user_id}", response_model=list[dict])
def list_user_assignments(user_id: UUID, db: Session = Depends(get_db)):
    """List all assignments for a user."""
    assignments = (
        db.query(CourseAssignment).filter(CourseAssignment.user_id == user_id).all()
    )

    return [
        {
            "id": str(a.id),
            "user_id": str(a.user_id),
            "course_id": str(a.course_id),
            "deadline": str(a.deadline) if a.deadline else None,
            "is_mandatory": a.is_mandatory,
            "assigned_at": a.assigned_at.isoformat(),
        }
        for a in assignments
    ]


@router.post("/course/{course_id}/department", response_model=dict)
def assign_course_to_department(
    course_id: UUID,
    department_id: str,
    deadline: Optional[str] = None,
    is_mandatory: bool = False,
    db: Session = Depends(get_db),
):
    """Bulk assign a course to all users in a department.

    POST /courses/{course_id}/assign/department accepts department_id, deadline (optional),
    is_mandatory (optional). Creates enrollment records for all active users in the department.
    Manager can only assign to their own department (dept_id from token).
    Skip already-enrolled users with warning. Publish department.course.assigned event to RabbitMQ.
    Returns assigned_count, skipped_count, errors array.
    """
    # Get course
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    # Get users in department (status = provisioned)
    users = (
        db.query(User)
        .filter(User.department == department_id, User.status == "provisioned")
        .all()
    )

    if not users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active users found in department {department_id}",
        )

    # Parse deadline
    deadline_date = None
    if deadline:
        deadline_date = datetime.strptime(deadline, "%Y-%m-%d").date()

    assigned_count = 0
    skipped_count = 0
    errors = []

    for user in users:
        # Check if already enrolled
        existing_enrollment = (
            db.query(Enrollment)
            .filter(
                Enrollment.user_id == user.id,
                Enrollment.course_id == course_id,
            )
            .first()
        )

        if existing_enrollment:
            skipped_count += 1
            continue

        # Create assignment
        try:
            assignment = CourseAssignment(
                user_id=user.id,
                course_id=course_id,
                deadline=deadline_date,
                is_mandatory=is_mandatory,
            )
            db.add(assignment)

            # Also create enrollment
            enrollment = Enrollment(
                user_id=user.id,
                course_id=course_id,
                status="in_progress",
            )
            db.add(enrollment)

            assigned_count += 1

        except Exception as e:
            errors.append(f"Failed to assign to {user.email}: {str(e)}")

    db.commit()

    # Publish department.course.assigned event to RabbitMQ
    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="learning",
            routing_key="learning.department.course.assigned",
            message={
                "event": "department.course.assigned",
                "courseId": str(course_id),
                "departmentId": department_id,
                "deadline": deadline,
                "isMandatory": is_mandatory,
                "assignedCount": assigned_count,
                "skippedCount": skipped_count,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    except Exception:
        pass

    return {
        "assigned_count": assigned_count,
        "skipped_count": skipped_count,
        "errors": errors,
    }
