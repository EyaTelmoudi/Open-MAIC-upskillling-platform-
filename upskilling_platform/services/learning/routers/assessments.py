"""Assessment and Question routers for the Learning Service."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from common.database import get_db
from common.enums import UserRole, QuestionType
from common.auth import decode_token
from common.models import (
    Assessment,
    Question,
    Module,
    Enrollment,
    AssessmentAttempt,
    User,
    Lesson,
    UserProgress,
)
from common.messaging import RabbitMQClient

from services.learning.schemas.assessment import (
    AssessmentCreate,
    AssessmentResponse,
    AssessmentUpdate,
    AssessmentWithQuestions,
    QuestionCreate,
    QuestionPublicResponse,
    QuestionUpdate,
    AnswerSubmission,
    AttemptResponse,
    AssessmentResultResponse,
    QuestionWithAnswerResponse,
    QuestionAttemptReviewResponse,
)
from services.learning.services.learner_context import record_quiz_attempt_context

router = APIRouter(prefix="/courses", tags=["assessments"])

security = HTTPBearer()


def get_current_user_from_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate the current user from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def require_learning_expert(current_user: dict) -> dict:
    """Require LearningExpert or higher role."""
    allowed_roles = {
        UserRole.SuperAdmin.value,
        UserRole.Admin.value,
        UserRole.Manager.value,
        UserRole.LearningExpert.value,
    }
    if current_user.get("role") not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only LearningExpert, Manager, Admin, or SuperAdmin can manage assessments",
        )
    return current_user


def _get_user_from_payload(payload: dict, db: Session) -> User:
    """Get User object from JWT payload."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _validate_course_access(module_id: UUID, user: User, db: Session) -> Module:
    """Validate user has access to the course containing this module."""
    module = get_module_or_404(db, module_id)
    course = db.query(Module).filter(Module.id == module_id).first()
    if user.role != "SuperAdmin" and module.course.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: course belongs to another tenant"
        )
    return module


def get_module_or_404(db: Session, module_id: UUID) -> Module:
    """Get module or raise 404."""
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )
    return module


def get_assessment_or_404(db: Session, assessment_id: UUID) -> Assessment:
    """Get assessment or raise 404."""
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return assessment


def get_question_or_404(db: Session, question_id: UUID) -> Question:
    """Get question or raise 404."""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found",
        )
    return question


def _validate_assessment_course_access(
    course_id: UUID,
    assessment: Assessment,
    user: User,
    db: Session,
) -> Module:
    module = get_module_or_404(db, assessment.module_id)
    if module.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment does not belong to this course",
        )
    if user.role != "SuperAdmin" and module.course.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: course belongs to another tenant",
        )
    return module


def _validate_question_payload(question_data: QuestionCreate | QuestionUpdate) -> None:
    question_type = getattr(question_data, "type", None)
    options = getattr(question_data, "options", None)
    correct_answer = getattr(question_data, "correct_answer", None)

    if question_type is not None and question_type not in [
        QuestionType.multiple_choice.value,
        QuestionType.true_false.value,
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid question type. Must be "
                f"'{QuestionType.multiple_choice.value}' or '{QuestionType.true_false.value}'"
            ),
        )

    if options is not None:
        normalized_options = [str(option).strip() for option in options if str(option).strip()]
        if len(normalized_options) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each question must provide at least two answer options",
            )
        if len(set(normalized_options)) != len(normalized_options):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Answer options must be unique",
            )

        if question_type == QuestionType.true_false.value:
            if {option.lower() for option in normalized_options} != {"true", "false"}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="True/false questions must use exactly 'True' and 'False' as options",
                )

    if correct_answer is not None and options is not None and correct_answer not in options:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Correct answer must be one of the options",
        )


def _normalize_question_options(options: list[str]) -> list[str]:
    return [str(option).strip() for option in options if str(option).strip()]


# ============ Assessment Endpoints ============


@router.get("/{course_id}/assessments", response_model=list[AssessmentResponse])
def list_assessments(
    course_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """List all assessments for a course (LearningExpert+ only)."""
    require_learning_expert(current_user)
    user_info = _get_user_from_payload(current_user, db)
    assessments = (
        db.query(Assessment).join(Module).filter(Module.course_id == course_id).all()
    )
    if user_info.role != "SuperAdmin":
        assessments = [
            assessment
            for assessment in assessments
            if assessment.module.course.tenant_id == user_info.tenant_id
        ]
    return assessments


@router.post(
    "/{course_id}/assessments",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_assessment(
    course_id: UUID,
    assessment_data: AssessmentCreate,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Create a new assessment for a course (LearningExpert+ only). Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    require_learning_expert(current_user)
    module = get_module_or_404(db, assessment_data.module_id)

    if user_info.role != "SuperAdmin" and module.course.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: course belongs to another tenant"
        )

    # Verify module belongs to the course
    if module.course_id != course_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Module does not belong to this course",
        )

    new_assessment = Assessment(
        module_id=assessment_data.module_id,
        title=assessment_data.title,
        passing_score=assessment_data.passing_score,
        time_limit=assessment_data.time_limit,
    )
    db.add(new_assessment)
    db.commit()
    db.refresh(new_assessment)
    return new_assessment


@router.get("/assessments/{assessment_id}", response_model=AssessmentWithQuestions)
def get_assessment(
    assessment_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Get assessment details with questions (LearningExpert+ only). Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    require_learning_expert(current_user)
    assessment = get_assessment_or_404(db, assessment_id)
    _validate_assessment_course_access(assessment.module.course_id, assessment, user_info, db)

    return assessment


@router.put("/assessments/{assessment_id}", response_model=AssessmentResponse)
def update_assessment(
    assessment_id: UUID,
    assessment_data: AssessmentUpdate,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Update an assessment (LearningExpert+ only). Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    require_learning_expert(current_user)
    assessment = get_assessment_or_404(db, assessment_id)
    _validate_assessment_course_access(assessment.module.course_id, assessment, user_info, db)

    update_dict = assessment_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(assessment, field, value)

    db.commit()
    db.refresh(assessment)
    return assessment


@router.delete("/assessments/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(
    assessment_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Delete an assessment (LearningExpert+ only). Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    require_learning_expert(current_user)
    assessment = get_assessment_or_404(db, assessment_id)
    _validate_assessment_course_access(assessment.module.course_id, assessment, user_info, db)

    db.delete(assessment)
    db.commit()
    return None


# ============ Question Endpoints ============


@router.post(
    "/{course_id}/assessments/{assessment_id}/questions",
    response_model=QuestionPublicResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_question(
    course_id: UUID,
    assessment_id: UUID,
    question_data: QuestionCreate,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Create a new question for an assessment (LearningExpert+ only).

    Note: Uses QuestionPublicResponse for response - does NOT expose correct_answer.
    """
    user_info = _get_user_from_payload(current_user, db)
    require_learning_expert(current_user)
    assessment = get_assessment_or_404(db, assessment_id)
    _validate_assessment_course_access(course_id, assessment, user_info, db)
    _validate_question_payload(question_data)
    normalized_options = _normalize_question_options(question_data.options)

    new_question = Question(
        assessment_id=assessment_id,
        text=question_data.text,
        type=question_data.type,
        options=normalized_options,
        correct_answer=question_data.correct_answer.strip(),
        points=question_data.points,
        order=question_data.order,
    )
    db.add(new_question)
    db.commit()
    db.refresh(new_question)
    return new_question


@router.put(
    "/{course_id}/assessments/{assessment_id}/questions/{question_id}",
    response_model=QuestionPublicResponse,
)
def update_question(
    course_id: UUID,
    assessment_id: UUID,
    question_id: UUID,
    question_data: QuestionUpdate,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Update a question (LearningExpert+ only).

    Note: Uses QuestionPublicResponse for response - does NOT expose correct_answer.
    """
    user_info = _get_user_from_payload(current_user, db)
    require_learning_expert(current_user)
    assessment = get_assessment_or_404(db, assessment_id)
    _validate_assessment_course_access(course_id, assessment, user_info, db)
    question = get_question_or_404(db, question_id)
    if question.assessment_id != assessment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question does not belong to this assessment",
        )

    update_dict = question_data.model_dump(exclude_unset=True)
    next_type = update_dict.get("type", question.type)
    next_options = update_dict.get("options", question.options)
    next_correct_answer = update_dict.get("correct_answer", question.correct_answer)
    merged_payload = QuestionCreate(
        text=update_dict.get("text", question.text),
        type=next_type,
        options=next_options,
        correct_answer=next_correct_answer,
        points=update_dict.get("points", question.points),
        order=update_dict.get("order", question.order),
    )
    _validate_question_payload(merged_payload)

    for field, value in update_dict.items():
        if field == "options":
            setattr(question, field, _normalize_question_options(value))
        elif field == "correct_answer":
            setattr(question, field, value.strip())
        else:
            setattr(question, field, value)

    db.commit()
    db.refresh(question)
    return question


@router.delete(
    "/{course_id}/assessments/{assessment_id}/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_question(
    course_id: UUID,
    assessment_id: UUID,
    question_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Delete a question (LearningExpert+ only)."""
    user_info = _get_user_from_payload(current_user, db)
    require_learning_expert(current_user)
    assessment = get_assessment_or_404(db, assessment_id)
    _validate_assessment_course_access(course_id, assessment, user_info, db)
    question = get_question_or_404(db, question_id)
    if question.assessment_id != assessment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question does not belong to this assessment",
        )
    db.delete(question)
    db.commit()
    return None


# ============ Assessment Taking Endpoints ============


def get_user_enrollment_or_404(
    db: Session, user_id: UUID, assessment_id: UUID
) -> Enrollment:
    """Verify user is enrolled in the course that contains this assessment."""
    assessment = get_assessment_or_404(db, assessment_id)
    module = assessment.module
    course_id = module.course_id

    user_uuid = UUID(str(user_id))
    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.user_id == user_uuid, Enrollment.course_id == course_id)
        .first()
    )

    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be enrolled in this course to take the assessment",
        )
    return enrollment


@router.get(
    "/{course_id}/assessments/{assessment_id}/questions",
    response_model=list[QuestionPublicResponse],
)
def get_assessment_questions(
    course_id: UUID,
    assessment_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Get assessment questions without exposing correct answers."""
    assessment = get_assessment_or_404(db, assessment_id)
    user_info = _get_user_from_payload(current_user, db)

    if user_info.role in {
        UserRole.Admin.value,
        UserRole.Manager.value,
        UserRole.LearningExpert.value,
        UserRole.SuperAdmin.value,
    }:
        _validate_assessment_course_access(course_id, assessment, user_info, db)
    else:
        get_user_enrollment_or_404(
            db, (current_user.get("sub") or current_user.get("id")), assessment_id
        )

    questions = (
        db.query(Question)
        .filter(Question.assessment_id == assessment_id)
        .order_by(Question.order)
        .all()
    )
    return questions


@router.get(
    "/{course_id}/assessments/{assessment_id}/memory-questions",
    response_model=list[QuestionWithAnswerResponse],
)
def get_assessment_questions_for_memory(
    course_id: UUID,
    assessment_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Get full quiz questions for server-side memory retention workflows."""
    user_info = _get_user_from_payload(current_user, db)
    require_learning_expert(current_user)
    assessment = get_assessment_or_404(db, assessment_id)
    _validate_assessment_course_access(course_id, assessment, user_info, db)

    questions = (
        db.query(Question)
        .filter(Question.assessment_id == assessment_id)
        .order_by(Question.order)
        .all()
    )

    return [
        QuestionWithAnswerResponse(
            id=question.id,
            assessment_id=question.assessment_id,
            text=question.text,
            type=question.type,
            options=question.options,
            correct_answer=question.correct_answer,
            points=question.points,
            order=question.order,
            user_answer=None,
            is_correct=None,
        )
        for question in questions
    ]


@router.post(
    "/{course_id}/assessments/{assessment_id}/submit",
    response_model=AssessmentResultResponse,
)
def submit_assessment(
    course_id: UUID,
    assessment_id: UUID,
    submission: AnswerSubmission,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Submit answers for an assessment and get scoring results."""
    assessment = get_assessment_or_404(db, assessment_id)
    user = _get_user_from_payload(current_user, db)
    user_id = current_user.get("sub") or current_user.get("id")
    _validate_assessment_course_access(course_id, assessment, user, db)
    get_user_enrollment_or_404(db, user_id, assessment_id)

    questions = (
        db.query(Question)
        .filter(Question.assessment_id == assessment_id)
        .order_by(Question.order)
        .all()
    )

    if not questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment has no questions",
        )

    total_points = sum(q.points for q in questions)
    earned_points = 0
    question_map = {str(question.id): question for question in questions}
    submitted_question_ids = set(submission.answers.keys())
    expected_question_ids = set(question_map.keys())

    unexpected_question_ids = submitted_question_ids - expected_question_ids
    if unexpected_question_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission contains unknown question IDs",
        )

    missing_question_ids = expected_question_ids - submitted_question_ids
    if missing_question_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All quiz questions must be answered before submission",
        )

    for question in questions:
        user_answer = submission.answers.get(str(question.id))
        if user_answer not in question.options:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each submitted answer must match one of the question options",
            )
        if user_answer and user_answer == question.correct_answer:
            earned_points += question.points

    wrong_answers = [
        {
            "questionId": str(question.id),
            "question": question.text,
            "userAnswer": submission.answers.get(str(question.id)),
            "correctAnswer": question.correct_answer,
        }
        for question in questions
        if submission.answers.get(str(question.id)) != question.correct_answer
    ]

    score = (earned_points / total_points * 100) if total_points > 0 else 0
    passed = score >= assessment.passing_score

    lesson = db.query(Lesson).filter(Lesson.assessment_id == assessment_id).first()
    attempt = AssessmentAttempt(
        user_id=user_id,
        assessment_id=assessment_id,
        answers=submission.answers,
        score=score,
        passed=passed,
        wrong_answers=wrong_answers,
        started_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
    )
    db.add(attempt)
    if lesson:
        record_quiz_attempt_context(
            db,
            user_id=UUID(str(user_id)),
            course_id=assessment.module.course_id,
            lesson_id=lesson.id,
            score=score,
            passed=passed,
            attempted_at=attempt.completed_at,
        )
    db.commit()
    db.refresh(attempt)

    rabbitmq = RabbitMQClient()

    # Check enrollment completion after passing assessment
    if passed:
        try:
            from services.learning.services.video_progress import (
                check_enrollment_completion,
            )
            from services.learning.gamification.badges import BadgeManager

            user_uuid = UUID(user_id)
            if lesson:
                lesson_progress = (
                    db.query(UserProgress)
                    .filter(
                        UserProgress.user_id == user_uuid,
                        UserProgress.lesson_id == lesson.id,
                    )
                    .first()
                )
                if not lesson_progress:
                    lesson_progress = UserProgress(
                        user_id=user_uuid,
                        lesson_id=lesson.id,
                        status="completed",
                        completed_at=datetime.utcnow(),
                    )
                    db.add(lesson_progress)
                else:
                    lesson_progress.status = "completed"
                    lesson_progress.completed_at = lesson_progress.completed_at or datetime.utcnow()

                db.commit()

                module = db.query(Module).filter(Module.id == lesson.module_id).first()
                if module:
                    check_enrollment_completion(db, user_uuid, module.course_id)
                    badge_manager = BadgeManager(db, rabbitmq)
                    badge_manager.check_and_award_badges(
                        user_id=str(user_id),
                        action="lesson_complete",
                        count=badge_manager.get_completed_lesson_count(str(user_id)),
                    )
                    badge_manager.award_time_of_day_badges(
                        user_id=str(user_id),
                        user_timezone=user.timezone,
                    )
        except Exception as e:
            print(f"Certificate check after assessment failed: {e}")

    if score == 100:
        try:
            from services.learning.gamification import XPManager
            from services.learning.gamification.badges import BadgeManager

            XPManager(db, rabbitmq).award_xp(
                user_id=str(user_id),
                action="perfect_score",
                reason=f"Perfect score on {assessment.title} ({assessment.id})",
            )
            BadgeManager(db, rabbitmq).check_and_award_badges(
                user_id=str(user_id),
                action="perfect_score",
                count=1,
            )
        except Exception as e:
            print(f"Perfect score rewards failed: {e}")

    questions_with_answers = []
    for q in questions:
        user_answer = attempt.answers.get(str(q.id))
        is_correct = user_answer == q.correct_answer if user_answer else None
        questions_with_answers.append(
            QuestionAttemptReviewResponse(
                id=q.id,
                assessment_id=q.assessment_id,
                text=q.text,
                type=q.type,
                options=q.options,
                points=q.points,
                order=q.order,
                user_answer=user_answer,
                is_correct=is_correct,
            )
        )

    return AssessmentResultResponse(
        id=attempt.id,
        assessment_id=assessment_id,
        title=assessment.title,
        score=attempt.score,
        passed=attempt.passed,
        total_points=total_points,
        earned_points=earned_points,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        questions=questions_with_answers,
    )


@router.get(
    "/{course_id}/assessments/{assessment_id}/attempts",
    response_model=list[AttemptResponse],
)
def list_assessment_attempts(
    course_id: UUID,
    assessment_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """List all attempts for an assessment by the current user."""
    attempts = (
        db.query(AssessmentAttempt)
        .filter(
            AssessmentAttempt.user_id
            == (current_user.get("sub") or current_user.get("id")),
            AssessmentAttempt.assessment_id == assessment_id,
        )
        .order_by(AssessmentAttempt.started_at.desc())
        .all()
    )
    return attempts


@router.get(
    "/{course_id}/assessments/{assessment_id}/results/{attempt_id}",
    response_model=AssessmentResultResponse,
)
def get_assessment_result(
    course_id: UUID,
    assessment_id: UUID,
    attempt_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Get detailed results for a specific attempt."""
    user = _get_user_from_payload(current_user, db)
    attempt = (
        db.query(AssessmentAttempt)
        .filter(
            AssessmentAttempt.id == attempt_id,
            AssessmentAttempt.user_id
            == (current_user.get("sub") or current_user.get("id")),
            AssessmentAttempt.assessment_id == assessment_id,
        )
        .first()
    )

    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found",
        )

    assessment = get_assessment_or_404(db, assessment_id)
    _validate_assessment_course_access(course_id, assessment, user, db)
    questions = (
        db.query(Question)
        .filter(Question.assessment_id == assessment_id)
        .order_by(Question.order)
        .all()
    )

    total_points = sum(q.points for q in questions)
    earned_points = sum(
        q.points
        for q in questions
        if attempt.answers.get(str(q.id)) == q.correct_answer
    )

    questions_with_answers = []
    for q in questions:
        user_answer = attempt.answers.get(str(q.id))
        is_correct = user_answer == q.correct_answer if user_answer else None
        questions_with_answers.append(
            QuestionAttemptReviewResponse(
                id=q.id,
                assessment_id=q.assessment_id,
                text=q.text,
                type=q.type,
                options=q.options,
                points=q.points,
                order=q.order,
                user_answer=user_answer,
                is_correct=is_correct,
            )
        )

    return AssessmentResultResponse(
        id=attempt.id,
        assessment_id=assessment_id,
        title=assessment.title,
        score=attempt.score,
        passed=attempt.passed,
        total_points=total_points,
        earned_points=earned_points,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        questions=questions_with_answers,
    )
