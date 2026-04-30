"""Security test: Quiz answer exposure vulnerability.

This test verifies that the quiz/assessment system does NOT expose correct_answer
to learners when they fetch questions via GET endpoints.

Vulnerability: Before the fix, QuestionResponse included correct_answer field,
allowing students to see all correct answers in the browser's network tab.

Fix:
- QuestionPublicResponse for GET endpoints (hides correct_answer)
- QuestionWithAnswerResponse for result/review endpoints only (includes correct_answer)
"""

import pytest
from uuid import uuid4


class TestQuizAnswerExposure:
    """Test that correct_answer is NOT exposed to learners via question-fetch endpoints."""

    def test_question_public_response_does_not_have_correct_answer_field(self):
        """Verify QuestionPublicResponse schema excludes correct_answer field."""
        # Import the schema
        from services.learning.schemas.assessment import QuestionPublicResponse

        # Create a sample question data (without correct_answer)
        question_data = {
            "id": str(uuid4()),
            "assessment_id": str(uuid4()),
            "text": "What is the capital of France?",
            "type": "multiple_choice",
            "options": ["Paris", "London", "Berlin", "Madrid"],
            "points": 1,
            "order": 1,
        }

        # Create schema instance - should NOT include correct_answer
        question = QuestionPublicResponse(**question_data)

        # Verify fields present
        assert hasattr(question, "id")
        assert hasattr(question, "text")
        assert hasattr(question, "options")
        assert hasattr(question, "points")
        assert hasattr(question, "order")

        # Verify correct_answer is NOT in the schema
        assert not hasattr(question, "correct_answer"), (
            "correct_answer should NOT be exposed"
        )

        # Verify JSON serialization does NOT include correct_answer
        json_dict = question.model_dump()
        assert "correct_answer" not in json_dict, (
            "correct_answer should not be in JSON output"
        )

    def test_question_with_answer_response_has_correct_answer_field(self):
        """Verify QuestionWithAnswerResponse schema includes correct_answer for results."""
        from services.learning.schemas.assessment import QuestionWithAnswerResponse

        question_data = {
            "id": str(uuid4()),
            "assessment_id": str(uuid4()),
            "text": "What is the capital of France?",
            "type": "multiple_choice",
            "options": ["Paris", "London", "Berlin", "Madrid"],
            "correct_answer": "Paris",  # This field IS present in this schema
            "points": 1,
            "order": 1,
            "user_answer": "Paris",
            "is_correct": True,
        }

        question = QuestionWithAnswerResponse(**question_data)

        # Verify correct_answer IS present
        assert hasattr(question, "correct_answer")
        assert question.correct_answer == "Paris"

        # Verify user answer fields are present
        assert hasattr(question, "user_answer")
        assert hasattr(question, "is_correct")

        # Verify JSON includes correct_answer
        json_dict = question.model_dump()
        assert "correct_answer" in json_dict, "correct_answer should be in results"

    def test_question_response_alias_points_to_public_response(self):
        """Verify QuestionResponse alias points to QuestionPublicResponse (deprecated)."""
        from services.learning.schemas.assessment import QuestionResponse

        # QuestionResponse should now be QuestionPublicResponse
        question_data = {
            "id": str(uuid4()),
            "assessment_id": str(uuid4()),
            "text": "Test question",
            "type": "true_false",
            "options": ["True", "False"],
            "points": 1,
            "order": 1,
        }

        question = QuestionResponse(**question_data)

        # Should NOT have correct_answer
        json_dict = question.model_dump()
        assert "correct_answer" not in json_dict


class TestAssessmentEndpointResponseTypes:
    """Verify endpoints use correct response schemas."""

    def test_assessment_result_uses_question_with_answer(self):
        """Verify AssessmentResultResponse uses QuestionWithAnswerResponse."""
        from services.learning.schemas.assessment import AssessmentResultResponse

        result_data = {
            "id": str(uuid4()),
            "assessment_id": str(uuid4()),
            "title": "Test Quiz",
            "score": 80.0,
            "passed": True,
            "total_points": 10,
            "earned_points": 8.0,
            "started_at": "2026-04-15T10:00:00",
            "completed_at": "2026-04-15T10:15:00",
            "questions": [
                {
                    "id": str(uuid4()),
                    "assessment_id": str(uuid4()),
                    "text": "Q1",
                    "type": "multiple_choice",
                    "options": ["A", "B", "C"],
                    "correct_answer": "A",  # Present in results
                    "points": 1,
                    "order": 1,
                    "user_answer": "A",
                    "is_correct": True,
                }
            ],
        }

        result = AssessmentResultResponse(**result_data)

        # Verify questions include correct_answer
        assert len(result.questions) == 1
        assert hasattr(result.questions[0], "correct_answer")
        assert result.questions[0].correct_answer == "A"

    def test_assessment_with_questions_uses_public_response(self):
        """Verify AssessmentWithQuestions uses QuestionPublicResponse."""
        from services.learning.schemas.assessment import AssessmentWithQuestions

        assessment_data = {
            "id": str(uuid4()),
            "module_id": str(uuid4()),
            "title": "Test Quiz",
            "passing_score": 70,
            "time_limit": 30,
            "created_at": "2026-04-15T10:00:00",
            "questions": [
                {
                    "id": str(uuid4()),
                    "assessment_id": str(uuid4()),
                    "text": "Q1",
                    "type": "multiple_choice",
                    "options": ["A", "B", "C"],
                    "points": 1,
                    "order": 1,
                    # Note: NO correct_answer here
                }
            ],
        }

        assessment = AssessmentWithQuestions(**assessment_data)

        # Verify questions do NOT include correct_answer
        assert len(assessment.questions) == 1
        json_dict = assessment.model_dump()
        for q in json_dict["questions"]:
            assert "correct_answer" not in q, (
                "correct_answer should not be in questions"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
