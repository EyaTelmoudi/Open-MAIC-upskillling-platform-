from __future__ import annotations

import json
import sys
from typing import Any

from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow


class CourseRefinementInput(BaseModel):
    action: str
    draftId: str
    title: str | None = None
    scenesCount: int | None = None
    source: str | None = None
    status: str | None = None


def _log(message: str) -> None:
    print(message, file=sys.stderr)


def handle_refinement_action(step_input: StepInput) -> StepOutput:
    payload = CourseRefinementInput.model_validate(step_input.input)

    _log("")
    _log("============================================================")
    _log("[Agno Course Refinement Agent] Request received")
    _log(f"- Workflow: course-refinement-agent")
    _log(f"- Action: {payload.action}")
    _log(f"- Draft ID: {payload.draftId}")
    if payload.title:
      _log(f"- Title: {payload.title}")
    if payload.scenesCount is not None:
      _log(f"- Scenes count: {payload.scenesCount}")
    if payload.source:
      _log(f"- Source: {payload.source}")
    if payload.status:
      _log(f"- Status: {payload.status}")

    if payload.action == "open_draft_for_editor":
      _log(
          "[Agno Course Refinement Agent] Draft data is ready and the editor can open the selected course."
      )
      _log("[Agno Course Refinement Agent] The selected draft was loaded for editing.")
    elif payload.action == "save_refined_draft":
      _log(
          "[Agno Course Refinement Agent] Updated draft content was received from the editor and sent for persistence."
      )
      _log("[Agno Course Refinement Agent] The edited draft was sent to be saved.")
    elif payload.action == "confirm_refined_draft_saved":
      _log(
          "[Agno Course Refinement Agent] Draft changes were saved successfully and the refined draft is now up to date in PostgreSQL."
      )
      _log("[Agno Course Refinement Agent] The refined draft is now saved in PostgreSQL.")
    elif payload.action == "generate_final_course":
      _log(
          "[Agno Course Refinement Agent] The learning expert requested final course generation from the edited draft."
      )
      _log("[Agno Course Refinement Agent] The finalized learner-facing course is being prepared.")
    elif payload.action == "confirm_final_course_generated":
      _log(
          "[Agno Course Refinement Agent] The final learner-facing course was generated successfully."
      )
      _log("[Agno Course Refinement Agent] The finalized course is now available for final review.")
    elif payload.action == "save_as_platform_course":
      _log(
          "[Agno Course Refinement Agent] The learning expert requested final approval for this course."
      )
      _log("[Agno Course Refinement Agent] The course is being saved as an official platform draft.")
    elif payload.action == "confirm_platform_course_saved":
      _log(
          "[Agno Course Refinement Agent] The course was saved successfully as an official platform course draft."
      )
      _log(
          "[Agno Course Refinement Agent] Authorized users can now access this company course in the platform workflow."
      )
    else:
      _log("[Agno Course Refinement Agent] Unknown refinement action received.")

    _log("============================================================")
    _log("")

    return StepOutput(
        content={
            "success": True,
            "workflowName": "course-refinement-agent",
            "action": payload.action,
            "draftId": payload.draftId,
            "status": payload.status,
            "source": payload.source,
        },
        success=True,
    )


course_refinement_workflow = Workflow(
    name="course-refinement-agent",
    description="Internal Course Refinement agent workflow for opening draft data in the editor and persisting refined draft changes.",
    input_schema=CourseRefinementInput,
    telemetry=False,
    steps=[
        Step(
            name="handle-refinement-action",
            description="Log and coordinate the internal draft refinement action.",
            executor=handle_refinement_action,
        )
    ],
)
