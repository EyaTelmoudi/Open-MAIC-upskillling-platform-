from __future__ import annotations

import json
import os
import re
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _chat_coach_site_packages() -> Path:
    return _repo_root() / "agents" / "chat-coach" / ".venv" / "Lib" / "site-packages"


def _ensure_chat_coach_site_packages() -> None:
    site_packages = _chat_coach_site_packages()
    site_packages_str = str(site_packages)
    if site_packages.exists() and site_packages_str not in sys.path:
        sys.path.append(site_packages_str)


_ensure_chat_coach_site_packages()

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.skills import LocalSkills, Skills
from agno.workflow import StepInput, StepOutput

from .prepared_context_store import PREPARED_CONTEXT_WAIT_SECONDS, load_prepared_context

DEFAULT_ENRICHMENT_MODEL = (
    os.getenv("CHAT_COACH_ENRICHMENT_MODEL")
    or "gemma-4-4b"
)
DEFAULT_ENRICHMENT_MODEL_URL = (
    os.getenv("CHAT_COACH_ENRICHMENT_MODEL_URL")
    or "http://models.endpoint.3s.local"
)
DEFAULT_ENRICHMENT_MODEL_API_KEY = (
    os.getenv("CHAT_COACH_ENRICHMENT_MODEL_API_KEY")
    or "sk-EBe-S_eHyf5z7f-B19UwHQ"
)
DEFAULT_RESPONSE_FALLBACK_MODEL = (
    os.getenv("CHAT_COACH_RESPONSE_FALLBACK_MODEL")
    or "openai/gpt-oss-120b:free"
)
DEFAULT_RESPONSE_FALLBACK_MODEL_URL = (
    os.getenv("CHAT_COACH_RESPONSE_FALLBACK_MODEL_URL")
    or "https://openrouter.ai/api/v1/chat/completions"
)
DEFAULT_RESPONSE_FALLBACK_MODEL_API_KEY = (
    os.getenv("CHAT_COACH_RESPONSE_FALLBACK_MODEL_API_KEY")
    or "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"
)


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _one_line_preview(value: object, *, limit: int = 220) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _ascii_safe(value: object) -> str:
    text = str(value or "")
    replacements = {
        "\u2011": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text.encode("ascii", "replace").decode("ascii")


def _log_json_block(log, title: str, payload: object) -> None:
    log(title)
    try:
        rendered = json.dumps(payload, indent=2, ensure_ascii=False)
    except Exception:
        rendered = str(payload)
    log(_ascii_safe(rendered))


def _message_snapshot(message: object) -> dict[str, Any]:
    if hasattr(message, "to_dict"):
        try:
            data = message.to_dict()
            return {
                "role": _clean_text(data.get("role")),
                "content_preview": _one_line_preview(data.get("content")),
                "tool_call_count": len(_as_list(data.get("tool_calls"))),
            }
        except Exception:
            pass
    return {
        "type": type(message).__name__,
        "preview": _one_line_preview(message),
    }


def _message_text_content(message: object) -> str:
    if hasattr(message, "to_dict"):
        try:
            data = message.to_dict()
            return _clean_text(data.get("content"))
        except Exception:
            return ""
    return ""


def _snapshot_agno_run_output(run_output: object) -> dict[str, Any]:
    snapshot: dict[str, Any] = {
        "type": type(run_output).__name__,
    }

    attrs = [
        "run_id",
        "agent_id",
        "agent_name",
        "session_id",
        "model",
        "model_provider",
        "content_type",
        "content",
        "reasoning_content",
        "citations",
        "followups",
        "created_at",
    ]
    for attr in attrs:
        if hasattr(run_output, attr):
            value = getattr(run_output, attr)
            if attr in {"content", "reasoning_content"}:
                snapshot[attr] = _one_line_preview(value, limit=600)
            elif attr == "citations":
                snapshot[attr] = bool(value)
            else:
                snapshot[attr] = value

    if hasattr(run_output, "metrics"):
        metrics = getattr(run_output, "metrics")
        if metrics is not None:
            if hasattr(metrics, "to_dict"):
                try:
                    snapshot["metrics"] = metrics.to_dict()
                except Exception:
                    snapshot["metrics"] = _one_line_preview(metrics)
            else:
                snapshot["metrics"] = metrics

    if hasattr(run_output, "messages"):
        messages = _as_list(getattr(run_output, "messages"))
        snapshot["message_count"] = len(messages)
        snapshot["messages_preview"] = [_message_snapshot(message) for message in messages[-3:]]

    if hasattr(run_output, "events"):
        events = _as_list(getattr(run_output, "events"))
        snapshot["event_count"] = len(events)
        snapshot["event_types"] = [
            _clean_text(getattr(event, "event", "")) or type(event).__name__
            for event in events[-8:]
        ]

    if hasattr(run_output, "to_dict"):
        try:
            run_output_dict = run_output.to_dict()
            snapshot["to_dict_preview"] = {
                "keys": sorted(run_output_dict.keys()),
                "content_preview": _one_line_preview(run_output_dict.get("content"), limit=600),
                "content_type": run_output_dict.get("content_type"),
                "model": run_output_dict.get("model"),
                "model_provider": run_output_dict.get("model_provider"),
                "message_count": len(_as_list(run_output_dict.get("messages"))),
                "event_count": len(_as_list(run_output_dict.get("events"))),
            }
        except Exception as error:
            snapshot["to_dict_error"] = f"{type(error).__name__}: {error}"

    snapshot["repr_preview"] = _one_line_preview(run_output, limit=600)
    return snapshot


def _strip_json_fences(text: str) -> str:
    cleaned = _clean_text(text)
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _extract_main_model_text(run_output: object) -> str:
    messages = _as_list(getattr(run_output, "messages", None))
    for message in reversed(messages):
        message_dict = message.to_dict() if hasattr(message, "to_dict") else {}
        role = _clean_text(message_dict.get("role")).lower()
        content = _clean_text(message_dict.get("content"))
        if role == "assistant" and content:
            return content
    return _clean_text(getattr(run_output, "content", ""))


def _parse_passage_ranking_json(raw_text: str) -> PassageRankingResult | None:
    cleaned = _strip_json_fences(raw_text)
    if not cleaned:
        return None
    try:
        return PassageRankingResult.model_validate_json(cleaned)
    except Exception:
        pass
    try:
        parsed = json.loads(cleaned)
        return PassageRankingResult.model_validate(parsed)
    except Exception:
        return None


def _parse_coaching_response_json(raw_text: str) -> CoachingResponse | None:
    cleaned = _strip_json_fences(raw_text)
    if not cleaned:
        return None
    try:
        return CoachingResponse.model_validate_json(cleaned)
    except Exception:
        pass
    try:
        parsed = json.loads(cleaned)
        return CoachingResponse.model_validate(parsed)
    except Exception:
        return None


def _coerce_model_result(result: object, model_type, *, fallback, log, task_name: str):
    if isinstance(result, model_type):
        return result
    if isinstance(result, dict):
        try:
            return model_type.model_validate(result)
        except Exception as error:
            log(
                f"[Agno Chat Coach Agent] {task_name} returned a dict that could not be validated: "
                f"{type(error).__name__}: {error}"
            )
            return fallback
    log(
        f"[Agno Chat Coach Agent] {task_name} did not return structured output. "
        f"contentType={type(result).__name__} preview={_one_line_preview(result)}"
    )
    return fallback


def _parse_recall_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in str(text or "").splitlines():
        line = _clean_text(raw_line)
        if not line:
            continue
        if line.lower() == "no relevant memories found.":
            continue
        if ". " in line and line.split(". ", 1)[0].isdigit():
            line = line.split(". ", 1)[1]
        lines.append(line)
    return lines


def _tokenize_for_ranking(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9_/-]+", _clean_text(text).casefold())
        if len(token) > 2
    }


def _looks_like_noisy_passage(text: str) -> bool:
    lowered = _clean_text(text).casefold()
    noisy_markers = [
        "course title is",
        "course titled",
        "course belongs to",
        "course id is",
        "xp reward",
        "lasting 5 minutes",
        "learning material for the lesson is",
        "lesson 1 is a video lesson",
        "video file",
        "module 1",
        "when: 2026-",
        "company-specific learning catalog",
    ]
    return any(marker in lowered for marker in noisy_markers)


def _filter_candidate_passages(candidates: list[str]) -> list[str]:
    filtered: list[str] = []
    for candidate in candidates:
        cleaned = _clean_text(candidate)
        if not cleaned or _looks_like_noisy_passage(cleaned):
            continue
        if cleaned not in filtered:
            filtered.append(cleaned)
    return filtered


def _humanize_fact_hint(text: str) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ""
    normalized = cleaned.replace("_", " ")
    normalized = re.sub(r"\bwhen \d{4} \d{2} \d{2}\b", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\binvolving [a-z0-9\- ]+\b", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\be58fa070 fcd4 40c3 a738 1199fa4b18d3\b", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .,-")
    if not normalized:
        return ""
    if normalized.lower().startswith("learner "):
        normalized = normalized[8:]
    return normalized


def _compact_hints(*groups: list[str], limit: int = 4) -> list[str]:
    compacted: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for item in group:
            hint = _humanize_fact_hint(item)
            if not hint:
                continue
            key = hint.casefold()
            if key in seen:
                continue
            compacted.append(hint)
            seen.add(key)
            if len(compacted) >= limit:
                return compacted
    return compacted


def _deterministic_rank_passages(
    *,
    question: str,
    candidates: list[str],
    known_topics: list[str],
    difficulty_areas: list[str],
    confusion_topics: list[str],
) -> PassageRankingResult:
    question_tokens = _tokenize_for_ranking(question)
    known_tokens = _tokenize_for_ranking(" ".join(known_topics))
    difficulty_tokens = _tokenize_for_ranking(" ".join(difficulty_areas))
    confusion_tokens = _tokenize_for_ranking(" ".join(confusion_topics))
    prefers_practical = any(
        phrase in _clean_text(question).casefold()
        for phrase in ["practical", "example", "examples", "abstract", "too abstract"]
    )

    scored: list[tuple[float, RankedPassage]] = []
    for candidate in candidates:
        candidate_tokens = _tokenize_for_ranking(candidate)
        if not candidate_tokens:
            continue

        topic_overlap = len(question_tokens & candidate_tokens)
        confusion_overlap = len(confusion_tokens & candidate_tokens)
        difficulty_overlap = len(difficulty_tokens & candidate_tokens)
        known_overlap = len(known_tokens & candidate_tokens)
        practical_boost = 1 if prefers_practical and any(
            marker in candidate.casefold() for marker in ["example", "examples", "approach", "practice", "practical"]
        ) else 0

        score = (
            (topic_overlap * 4.0)
            + (confusion_overlap * 3.0)
            + (difficulty_overlap * 2.0)
            + practical_boost
            - (known_overlap * 0.5)
        )
        normalized_score = max(0.05, min(1.0, score / 10.0))
        gap_match = bool(confusion_overlap or difficulty_overlap or practical_boost or topic_overlap >= 2)
        reason_parts: list[str] = []
        if topic_overlap:
            reason_parts.append("matches the learner question")
        if confusion_overlap or difficulty_overlap:
            reason_parts.append("aligns with the learner's gap")
        if practical_boost:
            reason_parts.append("fits the learner's preference for practical explanation")
        if not reason_parts:
            reason_parts.append("is the least weak candidate available")

        scored.append(
            (
                score,
                RankedPassage(
                    passage=candidate,
                    relevance_score=round(normalized_score, 2),
                    gap_match=gap_match,
                    relevance_reason=", ".join(reason_parts) + ".",
                ),
            )
        )

    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [passage for _, passage in scored[:3]]
    if not selected:
        return PassageRankingResult(
            ranked_passages=[],
            coverage_note="No candidate passages remained after deterministic filtering.",
        )

    if max(score for score, _ in scored) <= 0:
        coverage_note = (
            "Available passages are weakly related to the learner's question, so the ranker returned the least weak options."
        )
    else:
        coverage_note = "Selected passages cover the closest available explanation of the learner's requested concept and gap."

    return PassageRankingResult(ranked_passages=selected, coverage_note=coverage_note)


def _recent_turns_text(turns: list[dict[str, Any]], *, limit: int = 3) -> str:
    selected = turns[-limit:]
    parts: list[str] = []
    for turn in selected:
        speaker = _clean_text(turn.get("role") or turn.get("speaker") or "unknown")
        content = _clean_text(turn.get("content") or turn.get("message") or turn.get("text"))
        if content:
            parts.append(f"{speaker}: {content}")
    return "\n".join(parts).strip() or "No prior session turns available."


def _guess_initial_intent(question: str) -> dict[str, Any]:
    normalized = _clean_text(question).lower()
    if any(marker in normalized for marker in ["what next", "study next", "progress", "how am i doing"]):
        return {"intent": "progress", "reasoning": "Progress markers were detected in the learner question."}
    if any(marker in normalized for marker in ["quiz", "score", "failed", "wrong answer", "assessment"]):
        return {"intent": "quiz", "reasoning": "Quiz markers were detected in the learner question."}
    if any(marker in normalized for marker in ["i'm stuck", "im stuck", "confused", "do not understand", "don't understand"]):
        return {"intent": "stuck", "reasoning": "The learner explicitly expressed confusion or being stuck."}
    if any(marker in normalized for marker in ["weather", "movie", "recipe", "bitcoin", "football"]):
        return {"intent": "off_topic", "reasoning": "The learner question looks unrelated to the course domain."}
    return {"intent": "concept", "reasoning": "The learner question defaults to a concept explanation request."}


def _skill_root() -> Path:
    return _repo_root() / "agents" / "chat-coach" / "skills"


def _enrichment_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_ENRICHMENT_MODEL,
        base_url=DEFAULT_ENRICHMENT_MODEL_URL.rstrip("/"),
        api_key=DEFAULT_ENRICHMENT_MODEL_API_KEY,
        temperature=0,
        max_tokens=900,
    )


def _response_fallback_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_RESPONSE_FALLBACK_MODEL,
        base_url=DEFAULT_RESPONSE_FALLBACK_MODEL_URL.removesuffix("/chat/completions").rstrip("/"),
        api_key=DEFAULT_RESPONSE_FALLBACK_MODEL_API_KEY,
        temperature=0,
        max_tokens=900,
    )


def _response_composer_primary_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_ENRICHMENT_MODEL,
        base_url=DEFAULT_ENRICHMENT_MODEL_URL.rstrip("/"),
        api_key=DEFAULT_ENRICHMENT_MODEL_API_KEY,
        temperature=0,
        max_tokens=1400,
    )


def _response_composer_fallback_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_RESPONSE_FALLBACK_MODEL,
        base_url=DEFAULT_RESPONSE_FALLBACK_MODEL_URL.removesuffix("/chat/completions").rstrip("/"),
        api_key=DEFAULT_RESPONSE_FALLBACK_MODEL_API_KEY,
        temperature=0,
        max_tokens=1400,
    )


def _parser_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_ENRICHMENT_MODEL,
        base_url=DEFAULT_ENRICHMENT_MODEL_URL.rstrip("/"),
        api_key=DEFAULT_ENRICHMENT_MODEL_API_KEY,
        temperature=0,
        max_tokens=500,
    )


class RankedPassage(BaseModel):
    passage: str = Field(description="The selected candidate passage text.")
    relevance_score: float = Field(description="Coaching relevance score between 0 and 1.")
    gap_match: bool = Field(description="Whether the passage addresses something the learner does not know yet.")
    relevance_reason: str = Field(description="One sentence explaining why the passage was selected.")


class PassageRankingResult(BaseModel):
    ranked_passages: list[RankedPassage] = Field(description="At most three ranked passages.")
    coverage_note: str = Field(description="Short note describing what angle of the topic the selected passages cover.")


class LearnerProfile(BaseModel):
    goals: list[str] = Field(default_factory=list, description="Explicit or inferred learner goals.")
    learning_style: Literal["visual", "step_by_step", "example_first", "theory_first"] = Field(
        default="step_by_step",
        description="Primary learning style preference.",
    )
    experience_level: Literal["beginner", "intermediate", "advanced"] = Field(
        default="intermediate",
        description="Estimated learner experience level.",
    )
    struggles: list[str] = Field(default_factory=list, description="Topics the learner struggles with.")
    engagement_level: Literal["high", "medium", "low"] = Field(
        default="medium",
        description="Estimated engagement level.",
    )
    communication_preference: Literal["concise", "detailed", "conversational"] = Field(
        default="concise",
        description="Preferred explanation style.",
    )


class AffectSignal(BaseModel):
    affect: Literal["neutral", "frustrated", "anxious", "curious", "disengaged", "confident"] = Field(
        default="neutral",
        description="Dominant affect detected from the learner message and recent turns.",
    )
    intensity: Literal["low", "medium", "high"] = Field(
        default="low",
        description="Strength of the affect signal.",
    )
    needs_empathy: bool = Field(description="Whether the response should start with empathy or acknowledgement.")
    evidence: str = Field(description="Specific phrase or signal that triggered the affect decision.")


class FinalIntent(BaseModel):
    intent: Literal["concept", "quiz", "stuck", "progress", "off_topic"] = Field(
        description="Final trusted intent value for the coaching pipeline."
    )
    confidence: float = Field(description="Confidence score between 0 and 1.")
    question_type: Literal["single", "compound", "implicit", "venting", "contradictory"] = Field(
        description="Question shape after final interpretation."
    )
    is_ambiguous: bool = Field(description="Whether the question is too ambiguous to answer confidently.")
    correction_applied: bool = Field(description="Whether the initial intent was corrected.")
    clarification_question: str | None = Field(
        default=None,
        description="Specific clarification question to ask when the intent is ambiguous.",
    )
    reasoning: str = Field(description="Short explanation of the final intent decision.")


class CoachingResponse(BaseModel):
    answer: str = Field(description="Final learner-facing coaching answer.")
    why_this_answer: str = Field(description="Short explanation of why this response shape was chosen.")
    focus_points: list[str] = Field(default_factory=list, description="Short focus points for the learner.")
    follow_up_prompts: list[str] = Field(default_factory=list, description="Brief next prompts the learner could ask.")
    supporting_context: list[str] = Field(default_factory=list, description="Key context snippets that supported the answer.")


_PASSAGE_RANKER_AGENT: Agent | None = None
_SYNTHESIS_PARSER_AGENT: Agent | None = None
_AFFECT_DETECTOR_AGENT: Agent | None = None
_INTENT_FINALIZER_AGENT: Agent | None = None
_COACHING_RESPONSE_COMPOSER_AGENT: Agent | None = None
_COACHING_RESPONSE_COMPOSER_FALLBACK_AGENT: Agent | None = None


_COACHING_RESPONSE_COMPOSER_RULES = [
    "You compose the final learner-facing coaching response.",
    "Answer the learner's actual question first.",
    "Use the prepared context, learner profile, affect signal, and final intent together.",
    "Stay grounded in the supplied context and avoid unsupported course claims.",
    "Prefer the course's own vocabulary, framing, and workflow when the supplied context supports it.",
    "Reuse course ideas like user stories, acceptance criteria, architecture notes, tests, coding conventions, one feature at a time, and backlog linkage when they are supported by context.",
    "Use communication_preference from learner_profile to control answer length and tone.",
    "Use learning_style from learner_profile to control explanation order and structure.",
    "If the learner already knows the basics, do not repeat beginner definitions unless necessary.",
    "Prefer practical examples when the learner asks for them.",
    "If communication_preference is concise, keep the answer compact and use at most one short example.",
    "If communication_preference is detailed, provide a fuller explanation while staying focused.",
    "If communication_preference is conversational, use a natural coaching tone.",
    "If learning_style is step_by_step, explain in short ordered steps.",
    "If learning_style is example_first, start with the practical example before the abstraction.",
    "If learning_style is theory_first, explain the principle briefly before the example.",
    "If you give an example, make it illustrate the course's teaching directly instead of drifting into a generic software example.",
    "In the explanation and focus points, favor the workflow shift from specification before code generation to validation against the specification.",
    "When the learner is stuck, simplify the explanation and give a practical path forward.",
    "Keep the answer direct, useful, and concrete.",
    "Return only valid JSON with keys answer, why_this_answer, focus_points, follow_up_prompts, and supporting_context.",
    "Do not call tools. Do not load skills. Do not include markdown fences.",
]


@lru_cache(maxsize=1)
def _passage_ranker_agent() -> Agent:
    return Agent(
        name="Chat Coach Passage Ranker",
        model=_enrichment_model(),
        skills=Skills(loaders=[LocalSkills(str(_skill_root()))]),
        instructions=[
            "You rank recalled course passages for coaching usefulness.",
            "Load the passage-ranker skill instructions before ranking any passage.",
            "Score each candidate by coaching relevance, not only topic similarity.",
            "Select at most three passages and justify each selection briefly.",
            "If candidate passages are provided, you must rank from that list and must not claim that no input was provided.",
            "If candidate_passages is non-empty, ranked_passages must contain at least one passage from that list.",
            "Return only valid JSON matching the requested shape.",
        ],
        expected_output=(
            "Return valid JSON with keys ranked_passages and coverage_note. "
            "Each ranked_passage must include passage, relevance_score, gap_match, and relevance_reason."
        ),
        use_json_mode=True,
        retries=0,
        markdown=False,
        telemetry=False,
        debug_mode=False,
    )


@lru_cache(maxsize=1)
def _synthesis_parser_agent() -> Agent:
    return Agent(
        name="Chat Coach Synthesis Parser",
        model=_enrichment_model(),
        skills=Skills(loaders=[LocalSkills(str(_skill_root()))]),
        instructions=[
            "You parse a prose learner synthesis into a typed learner profile.",
            "Load the synthesis-parser skill instructions before parsing the synthesis.",
            "Use safe defaults when the synthesis is weak or incomplete.",
            "Return only structured output matching the schema.",
        ],
        expected_output=(
            "Return JSON with keys goals, learning_style, experience_level, struggles, "
            "engagement_level, communication_preference."
        ),
        output_schema=LearnerProfile,
        parser_model=_parser_model(),
        parser_model_prompt="""
Convert the response into the exact LearnerProfile schema.
Return valid JSON only.
- goals: list[string]
- learning_style: visual, step_by_step, example_first, or theory_first
- experience_level: beginner, intermediate, or advanced
- struggles: list[string]
- engagement_level: high, medium, or low
- communication_preference: concise, detailed, or conversational
Do not include markdown fences or extra keys.
""".strip(),
        use_json_mode=True,
        retries=0,
        markdown=False,
        telemetry=False,
        debug_mode=False,
    )


@lru_cache(maxsize=1)
def _affect_detector_agent() -> Agent:
    return Agent(
        name="Chat Coach Affect Detector",
        model=_enrichment_model(),
        skills=Skills(loaders=[LocalSkills(str(_skill_root()))]),
        instructions=[
            "You detect the learner's affect from the latest message and the recent session turns.",
            "Load the affect-detector skill instructions before deciding the affect.",
            "Use concrete evidence from the learner message or recent turns.",
            "Return only structured output matching the schema.",
        ],
        expected_output="Return JSON with keys affect, intensity, needs_empathy, evidence.",
        output_schema=AffectSignal,
        parser_model=_parser_model(),
        parser_model_prompt="""
Convert the response into the exact AffectSignal schema.
Return valid JSON only.
- affect: neutral, frustrated, anxious, curious, disengaged, or confident
- intensity: low, medium, or high
- needs_empathy: boolean
- evidence: string
Do not include markdown fences or extra keys.
""".strip(),
        use_json_mode=True,
        retries=0,
        markdown=False,
        telemetry=False,
        debug_mode=False,
    )


@lru_cache(maxsize=1)
def _intent_finalizer_agent() -> Agent:
    return Agent(
        name="Chat Coach Intent Finalizer",
        model=_enrichment_model(),
        skills=Skills(loaders=[LocalSkills(str(_skill_root()))]),
        instructions=[
            "You finalize the learner question intent for the coaching pipeline.",
            "Load the intent-finalizer skill instructions before deciding the final intent.",
            "Use the initial intent, raw learner message, and recent session turns for coherence.",
            "If no explicit affect signal is provided, infer only lightweight tone hints from the same message.",
            "Return only structured output matching the schema.",
        ],
        expected_output=(
            "Return JSON with keys intent, confidence, question_type, is_ambiguous, "
            "correction_applied, clarification_question, reasoning."
        ),
        output_schema=FinalIntent,
        parser_model=_parser_model(),
        parser_model_prompt="""
Convert the response into the exact FinalIntent schema.
Return valid JSON only.
- intent: concept, quiz, stuck, progress, or off_topic
- confidence: number
- question_type: single, compound, implicit, venting, or contradictory
- is_ambiguous: boolean
- correction_applied: boolean
- clarification_question: string or null
- reasoning: string
Do not include markdown fences or extra keys.
""".strip(),
        use_json_mode=True,
        retries=0,
        markdown=False,
        telemetry=False,
        debug_mode=False,
    )


@lru_cache(maxsize=1)
def _coaching_response_composer_agent() -> Agent:
    return Agent(
        name="Chat Coach Response Composer",
        model=_response_composer_primary_model(),
        instructions=_COACHING_RESPONSE_COMPOSER_RULES,
        expected_output=(
            "Return JSON with keys answer, why_this_answer, focus_points, "
            "follow_up_prompts, and supporting_context."
        ),
        use_json_mode=True,
        retries=0,
        markdown=False,
        telemetry=False,
        debug_mode=False,
    )


@lru_cache(maxsize=1)
def _coaching_response_composer_fallback_agent() -> Agent:
    return Agent(
        name="Chat Coach Response Composer Fallback",
        model=_response_composer_fallback_model(),
        instructions=_COACHING_RESPONSE_COMPOSER_RULES,
        expected_output=(
            "Return JSON with keys answer, why_this_answer, focus_points, "
            "follow_up_prompts, and supporting_context."
        ),
        use_json_mode=True,
        retries=0,
        markdown=False,
        telemetry=False,
        debug_mode=False,
    )


def _build_synthesis_text(validated_context: dict[str, Any], prepared_context: dict[str, Any]) -> str:
    general_profile = _as_dict(prepared_context.get("tenant_user_structured_profile"))
    course_profile = _as_dict(prepared_context.get("tenant_user_course_structured_profile"))
    general_facts = [_clean_text(item) for item in _as_list(prepared_context.get("general_facts")) if _clean_text(item)]
    course_facts = [_clean_text(item) for item in _as_list(prepared_context.get("course_facts")) if _clean_text(item)]
    profile_parts: list[str] = []

    background = ", ".join(_as_list(general_profile.get("background_facts")))
    if background:
        profile_parts.append(f"The learner background includes: {background}.")

    communication = ", ".join(_as_list(general_profile.get("communication_preferences")))
    if communication:
        profile_parts.append(f"The learner communication preferences include: {communication}.")

    style = ", ".join(_as_list(general_profile.get("style_preferences")))
    if style:
        profile_parts.append(f"The learner learning style preferences include: {style}.")

    known_topics = ", ".join(_as_list(general_profile.get("known_topics")))
    if known_topics:
        profile_parts.append(f"The learner already knows: {known_topics}.")

    struggles = ", ".join(_as_list(general_profile.get("difficulty_areas")))
    if struggles:
        profile_parts.append(f"The learner has recurring difficulty areas in: {struggles}.")

    course_struggles = ", ".join(_as_list(course_profile.get("confusion_topics")))
    if course_struggles:
        profile_parts.append(f"In this course, the learner is confused about: {course_struggles}.")

    if general_facts:
        profile_parts.append("Recent extracted general facts: " + "; ".join(general_facts) + ".")
    if course_facts:
        profile_parts.append("Recent extracted course facts: " + "; ".join(course_facts) + ".")

    reasoning = _clean_text(prepared_context.get("extraction_reasoning") or validated_context.get("learner_discussion_reasoning"))
    if reasoning:
        profile_parts.append(f"Recent coaching extraction reasoning: {reasoning}")

    return " ".join(profile_parts).strip() or "This is a new learner with no known prior profile information."


def _extract_supporting_memories_from_based_on(based_on: object, *, limit: int = 4) -> list[dict[str, Any]]:
    based_on_dict = _as_dict(based_on)
    if not based_on_dict:
        return []
    if isinstance(based_on_dict.get("memories"), list):
        return [item for item in based_on_dict["memories"][:limit] if isinstance(item, dict)]

    flattened: list[dict[str, Any]] = []
    for value in based_on_dict.values():
        if not isinstance(value, list):
            continue
        for item in value:
            if isinstance(item, dict):
                flattened.append(item)
            if len(flattened) >= limit:
                return flattened
    return flattened[:limit]


def _prepared_course_support(prepared_context: dict[str, Any], *, limit: int = 4) -> list[str]:
    reflect_result = _as_dict(prepared_context.get("tenant_course_reflect_result"))
    support: list[str] = []

    reflect_text = _clean_text(reflect_result.get("text"))
    if reflect_text:
        support.append(reflect_text)

    for memory in _extract_supporting_memories_from_based_on(reflect_result.get("based_on"), limit=limit):
        text = _clean_text(memory.get("text") or memory.get("content") or memory.get("memory"))
        if text and text not in support:
            support.append(text)
        if len(support) >= limit:
            break

    if not support:
        for line in _parse_recall_lines(_clean_text(prepared_context.get("tenant_course_memories"))):
            if line not in support:
                support.append(line)
            if len(support) >= limit:
                break
    if not support:
        for line in _parse_recall_lines(_clean_text(prepared_context.get("tenant_user_course_memories"))):
            if line not in support:
                support.append(line)
            if len(support) >= limit:
                break
    if not support:
        for item in _as_list(prepared_context.get("course_facts")):
            line = _clean_text(item)
            if line and line not in support:
                support.append(line)
            if len(support) >= limit:
                break
    return support[:limit]


def _candidate_passage_sources(prepared_context: dict[str, Any], validated_context: dict[str, Any]) -> dict[str, list[str]]:
    return {
        "tenant_course_memories": _parse_recall_lines(prepared_context.get("tenant_course_memories")),
        "tenant_user_course_memories": _parse_recall_lines(prepared_context.get("tenant_user_course_memories")),
        "tenant_user_memories": _parse_recall_lines(prepared_context.get("tenant_user_memories")),
        "prepared_course_facts": [
            _clean_text(item)
            for item in _as_list(prepared_context.get("course_facts"))
            if _clean_text(item)
        ],
        "prepared_general_facts": [
            _clean_text(item)
            for item in _as_list(prepared_context.get("general_facts"))
            if _clean_text(item)
        ],
        "validated_course_facts": [
            _clean_text(item)
            for item in _as_list(validated_context.get("learner_discussion_course_facts"))
            if _clean_text(item)
        ],
        "validated_general_facts": [
            _clean_text(item)
            for item in _as_list(validated_context.get("learner_discussion_general_facts"))
            if _clean_text(item)
        ],
    }


def _rank_candidate_passages(prepared_context: dict[str, Any], validated_context: dict[str, Any]) -> list[str]:
    candidates: list[str] = []
    for lines in _candidate_passage_sources(prepared_context, validated_context).values():
        for line in lines:
            if line not in candidates:
                candidates.append(line)
    return candidates[:12]


def _load_previous_content(step_input: StepInput) -> dict[str, Any]:
    prepared_step_content = step_input.get_step_content("load-prepared-context")
    if isinstance(prepared_step_content, dict):
        return prepared_step_content
    previous_content = step_input.previous_step_content
    return previous_content if isinstance(previous_content, dict) else {}


def load_prepared_context_step(step_input: StepInput, *, log) -> StepOutput:
    previous_content = step_input.previous_step_content
    previous_content = previous_content if isinstance(previous_content, dict) else {}
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    validated_context = _as_dict(previous_content.get("validatedContext"))
    prepared_context_id = _clean_text(previous_content.get("preparedContextId") or validated_context.get("prepared_context_id"))
    question = _clean_text(previous_content.get("question"))
    initial_intent = _guess_initial_intent(question)

    prepared_context: dict[str, Any] = {}
    loaded = False
    if prepared_context_id:
        log(
            "[Agno Chat Coach Agent] Loading prepared coaching context before the enrichment wave. "
            f"preparedContextId={prepared_context_id}"
        )
        payload = load_prepared_context(
            prepared_context_id,
            wait_seconds=PREPARED_CONTEXT_WAIT_SECONDS,
            log=log,
        )
        if isinstance(payload, dict):
            prepared_context = payload
            loaded = True

    log(
        "[Agno Chat Coach Agent] Prepared context load step finished. "
        f"loaded={loaded} generalFacts={len(prepared_context.get('general_facts') or [])} "
        f"courseFacts={len(prepared_context.get('course_facts') or [])}"
    )

    return StepOutput(
        content={
            **previous_content,
            "action": "load_prepared_context",
            "preparedContext": prepared_context,
            "preparedContextLoaded": loaded,
            "initialIntent": initial_intent,
        },
        success=True,
    )


def rank_passages_step(step_input: StepInput, *, log) -> StepOutput:
    previous_content = _load_previous_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    prepared_context = _as_dict(previous_content.get("preparedContext"))
    validated_context = _as_dict(previous_content.get("validatedContext"))
    question = _clean_text(previous_content.get("question"))
    candidate_sources = _candidate_passage_sources(prepared_context, validated_context)
    candidates = _rank_candidate_passages(prepared_context, validated_context)
    filtered_candidates = _filter_candidate_passages(candidates)
    general_profile = _as_dict(prepared_context.get("tenant_user_structured_profile"))
    course_profile = _as_dict(prepared_context.get("tenant_user_course_structured_profile"))

    log(
        "[Agno Chat Coach Agent] T2 Passage Ranker candidate source counts: "
        + ", ".join(f"{source}={len(items)}" for source, items in candidate_sources.items())
    )
    if candidates:
        _log_json_block(
            log,
            "[Agno Chat Coach Agent] T2 Passage Ranker candidate passages:",
            candidates,
        )
    if filtered_candidates:
        _log_json_block(
            log,
            "[Agno Chat Coach Agent] T2 Passage Ranker filtered candidate passages:",
            filtered_candidates,
        )

    if not filtered_candidates:
        result = PassageRankingResult(
            ranked_passages=[],
            coverage_note="No usable candidate passages remained after filtering noisy prepared-context passages.",
        )
    else:
        known_topics = _compact_hints(
            [str(item) for item in _as_list(general_profile.get("known_topics")) if _clean_text(item)],
            [str(item) for item in _as_list(prepared_context.get("general_facts")) if _clean_text(item)],
            [str(item) for item in _as_list(validated_context.get("learner_discussion_general_facts")) if _clean_text(item)],
            limit=3,
        )
        difficulty_areas = _compact_hints(
            [str(item) for item in _as_list(general_profile.get("difficulty_areas")) if _clean_text(item)],
            [str(item) for item in _as_list(prepared_context.get("course_facts")) if _clean_text(item)],
            [str(item) for item in _as_list(validated_context.get("learner_discussion_course_facts")) if _clean_text(item)],
            limit=3,
        )
        confusion_topics = _compact_hints(
            [str(item) for item in _as_list(course_profile.get("confusion_topics")) if _clean_text(item)],
            [str(item) for item in _as_list(prepared_context.get("course_facts")) if _clean_text(item)],
            [str(item) for item in _as_list(validated_context.get("learner_discussion_course_facts")) if _clean_text(item)],
            limit=3,
        )
        ranking_payload = {
            "question": question,
            "candidate_count": len(filtered_candidates),
            "learner_known_topics": known_topics,
            "learner_difficulty_areas": difficulty_areas,
            "course_confusion_topics": confusion_topics,
            "candidate_passages": filtered_candidates,
        }
        _log_json_block(
            log,
            "[Agno Chat Coach Agent] T2 Passage Ranker compact ranking payload:",
            ranking_payload,
        )
        run_output = _passage_ranker_agent().run(
            "\n".join(
                [
                    "Rank these candidate coaching passages.",
                    "Use candidate_passages as the authoritative list of passages to rank.",
                    "candidate_passages is non-empty in this request.",
                    "Select one to three passages directly from candidate_passages.",
                    "Do not answer that no input was provided.",
                    "If all candidates are weak, still return the best available one to three passages and explain the limitation in coverage_note.",
                    "Keep relevance_reason short and specific.",
                    "Structured ranking input:",
                    _ascii_safe(json.dumps(ranking_payload, ensure_ascii=False, indent=2)),
                ]
            )
        )
        _log_json_block(
            log,
            "[Agno Chat Coach Agent] T2 Passage Ranker full run output snapshot:",
            _snapshot_agno_run_output(run_output),
        )
        raw_result = _extract_main_model_text(run_output)
        _log_json_block(
            log,
            "[Agno Chat Coach Agent] T2 Passage Ranker main model text:",
            raw_result,
        )
        parsed_result = _parse_passage_ranking_json(raw_result)
        if parsed_result is None:
            log(
                "[Agno Chat Coach Agent] T2 Passage Ranker main model text could not be parsed into PassageRankingResult."
            )
            result = PassageRankingResult(
                ranked_passages=[],
                coverage_note="Passage ranking failed, so no ranked passages were produced.",
            )
        else:
            result = parsed_result

    log(
        "[Agno Chat Coach Agent] T2 Passage Ranker finished. "
        f"selected={len(result.ranked_passages)} coverage={_one_line_preview(result.coverage_note)}"
    )
    _log_json_block(
        log,
        "[Agno Chat Coach Agent] T2 Passage Ranker result:",
        result.model_dump(),
    )
    return StepOutput(
        content={
            **previous_content,
            "action": "rank_passages",
            "rankedPassages": result.model_dump(),
        },
        success=True,
    )


def parse_synthesis_step(step_input: StepInput, *, log) -> StepOutput:
    previous_content = _load_previous_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    validated_context = _as_dict(previous_content.get("validatedContext"))
    prepared_context = _as_dict(previous_content.get("preparedContext"))
    synthesis_text = _build_synthesis_text(validated_context, prepared_context)

    if "new learner" in synthesis_text.lower():
        result = LearnerProfile()
    else:
        raw_result = _synthesis_parser_agent().run(
            "\n".join(
                [
                    "Parse this learner synthesis into a typed learner profile.",
                    f"Synthesis: {synthesis_text}",
                ]
            )
        ).content
        result = _coerce_model_result(
            raw_result,
            LearnerProfile,
            fallback=LearnerProfile(),
            log=log,
            task_name="T3 Synthesis Parser",
        )

    log(
        "[Agno Chat Coach Agent] T3 Synthesis Parser finished. "
        f"experience={result.experience_level} style={result.learning_style} "
        f"communication={result.communication_preference}"
    )
    _log_json_block(
        log,
        "[Agno Chat Coach Agent] T3 Synthesis Parser result:",
        result.model_dump(),
    )
    return StepOutput(
        content={
            **previous_content,
            "action": "parse_synthesis",
            "learnerProfile": result.model_dump(),
        },
        success=True,
    )


def detect_affect_signal_step(step_input: StepInput, *, log) -> StepOutput:
    previous_content = _load_previous_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    validated_context = _as_dict(previous_content.get("validatedContext"))
    question = _clean_text(previous_content.get("question"))
    session_turns = _as_list(validated_context.get("session_turns"))
    recent_turns = _recent_turns_text(session_turns)

    raw_result = _affect_detector_agent().run(
        "\n".join(
            [
                "Detect the learner affect for this coaching interaction.",
                f"Latest learner message: {question}",
                "Recent session turns:",
                recent_turns,
            ]
        )
    ).content
    result = _coerce_model_result(
        raw_result,
        AffectSignal,
        fallback=AffectSignal(
            affect="neutral",
            intensity="low",
            needs_empathy=False,
            evidence="No reliable affect signal was produced.",
        ),
        log=log,
        task_name="T4 Affect Detector",
    )

    log(
        "[Agno Chat Coach Agent] T4 Affect Detector finished. "
        f"affect={result.affect} intensity={result.intensity} needsEmpathy={result.needs_empathy}"
    )
    _log_json_block(
        log,
        "[Agno Chat Coach Agent] T4 Affect Detector result:",
        result.model_dump(),
    )
    return StepOutput(
        content={
            **previous_content,
            "action": "detect_affect_signal",
            "affectSignal": result.model_dump(),
        },
        success=True,
    )


def finalize_intent_step(step_input: StepInput, *, log) -> StepOutput:
    previous_content = _load_previous_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    validated_context = _as_dict(previous_content.get("validatedContext"))
    question = _clean_text(previous_content.get("question"))
    session_turns = _as_list(validated_context.get("session_turns"))
    initial_intent = _as_dict(previous_content.get("initialIntent"))
    affect_step_content = step_input.get_step_content("detect-affect-signal")
    affect_signal = _as_dict(_as_dict(affect_step_content).get("affectSignal"))
    recent_turns = _recent_turns_text(session_turns)

    raw_result = _intent_finalizer_agent().run(
        "\n".join(
            [
                "Finalize the learner intent for the coaching pipeline.",
                f"Latest learner message: {question}",
                f"Initial intent: {json.dumps(initial_intent, ensure_ascii=False)}",
                f"Affect signal: {json.dumps(affect_signal, ensure_ascii=False) if affect_signal else 'not available yet'}",
                "Recent session turns:",
                recent_turns,
            ]
        )
    ).content
    result = _coerce_model_result(
        raw_result,
        FinalIntent,
        fallback=FinalIntent(
            intent=_clean_text(initial_intent.get("intent")) or "concept",
            confidence=0.2,
            question_type="single",
            is_ambiguous=False,
            correction_applied=False,
            clarification_question=None,
            reasoning=_clean_text(initial_intent.get("reasoning")) or "Fallback initial intent was used.",
        ),
        log=log,
        task_name="T6 Intent Finalizer",
    )

    log(
        "[Agno Chat Coach Agent] T6 Intent Finalizer finished. "
        f"intent={result.intent} confidence={result.confidence} "
        f"ambiguous={result.is_ambiguous} corrected={result.correction_applied}"
    )
    _log_json_block(
        log,
        "[Agno Chat Coach Agent] T6 Intent Finalizer result:",
        result.model_dump(),
    )
    return StepOutput(
        content={
            **previous_content,
            "action": "finalize_intent",
            "finalIntent": result.model_dump(),
            "questionIntent": result.model_dump(),
        },
        success=True,
    )


def merge_parallel_enrichment_step(step_input: StepInput, *, log) -> StepOutput:
    loaded_content = _as_dict(step_input.get_step_content("load-prepared-context"))
    if loaded_content.get("success") is False:
        return StepOutput(content=loaded_content, success=False)

    ranked_passages: dict[str, Any] = {}
    learner_profile = _as_dict(_as_dict(step_input.get_step_content("parse-synthesis")).get("learnerProfile"))
    affect_signal = _as_dict(_as_dict(step_input.get_step_content("detect-affect-signal")).get("affectSignal"))
    final_intent = _as_dict(_as_dict(step_input.get_step_content("finalize-intent")).get("finalIntent"))

    answer_context = {
        "preparedContextLoaded": bool(loaded_content.get("preparedContextLoaded")),
        "rankedPassages": ranked_passages,
        "learnerProfile": learner_profile,
        "affectSignal": affect_signal,
        "finalIntent": final_intent,
    }

    log(
        "[Agno Chat Coach Agent] Parallel enrichment wave finished. "
        f"finalIntent={_clean_text(final_intent.get('intent')) or 'unknown'}"
    )
    _log_json_block(
        log,
        "[Agno Chat Coach Agent] Parallel enrichment merged result:",
        answer_context,
    )
    return StepOutput(
        content={
            **loaded_content,
            "success": True,
            "workflowName": "chat-coach-agent",
            "action": "merge_parallel_enrichment",
            "answer": "Prepared context and enrichment wave completed successfully.",
            "questionIntent": final_intent,
            "answerContext": answer_context,
            "rankedPassages": ranked_passages,
            "learnerProfile": learner_profile,
            "affectSignal": affect_signal,
            "finalIntent": final_intent,
        },
        success=True,
    )


def compose_coaching_response_step(step_input: StepInput, *, log) -> StepOutput:
    previous_content = step_input.previous_step_content
    previous_content = previous_content if isinstance(previous_content, dict) else {}
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    prepared_context = _as_dict(previous_content.get("preparedContext"))
    validated_context = _as_dict(previous_content.get("validatedContext"))
    answer_context = _as_dict(previous_content.get("answerContext"))
    learner_profile = _as_dict(answer_context.get("learnerProfile"))
    affect_signal = _as_dict(answer_context.get("affectSignal"))
    final_intent = _as_dict(answer_context.get("finalIntent"))
    question = _clean_text(previous_content.get("question"))

    prepared_support = _prepared_course_support(prepared_context)
    recent_general_facts = [
        _clean_text(item)
        for item in _as_list(prepared_context.get("general_facts")) + _as_list(validated_context.get("learner_discussion_general_facts"))
        if _clean_text(item)
    ]
    recent_course_facts = [
        _clean_text(item)
        for item in _as_list(prepared_context.get("course_facts")) + _as_list(validated_context.get("learner_discussion_course_facts"))
        if _clean_text(item)
    ]

    composer_payload = {
        "question": question,
        "course_title": _clean_text(validated_context.get("course_title")),
        "current_lesson_title": _clean_text(validated_context.get("current_lesson_title")),
        "intent": final_intent,
        "affect_signal": affect_signal,
        "learner_profile": learner_profile,
        "recent_general_facts": recent_general_facts,
        "recent_course_facts": recent_course_facts,
        "prepared_course_support": prepared_support,
        "prepared_user_context": {
            "known_topics": _as_list(_as_dict(prepared_context.get("tenant_user_structured_profile")).get("known_topics")),
            "style_preferences": _as_list(_as_dict(prepared_context.get("tenant_user_structured_profile")).get("style_preferences")),
            "communication_preferences": _as_list(_as_dict(prepared_context.get("tenant_user_structured_profile")).get("communication_preferences")),
            "difficulty_areas": _as_list(_as_dict(prepared_context.get("tenant_user_structured_profile")).get("difficulty_areas")),
        },
        "prepared_course_context": {
            "confusion_topics": _as_list(_as_dict(prepared_context.get("tenant_user_course_structured_profile")).get("confusion_topics")),
            "course_relevant_facts": _as_list(_as_dict(prepared_context.get("tenant_user_course_structured_profile")).get("course_relevant_facts")),
        },
    }
    _log_json_block(
        log,
        "[Agno Chat Coach Agent] Coaching response composer input:",
        composer_payload,
    )

    log(
        "[Agno Chat Coach Agent] Coaching response composer using primary model "
        f"{DEFAULT_ENRICHMENT_MODEL} at {DEFAULT_ENRICHMENT_MODEL_URL}"
    )
    primary_run_output = _coaching_response_composer_agent().run(
        "\n".join(
            [
                "Compose the final coaching response for the learner.",
                "Use the supplied prepared context, learner profile, affect signal, and final intent.",
                "If the learner asks for a practical example, include one when the context reasonably supports it.",
                "If the learner already knows the basics, do not repeat beginner material.",
                "Structured coaching input:",
                json.dumps(composer_payload, ensure_ascii=False, indent=2),
            ]
        )
    )
    raw_result = _extract_main_model_text(primary_run_output)
    _log_json_block(
        log,
        "[Agno Chat Coach Agent] Coaching response composer primary model text:",
        raw_result,
    )
    result = _parse_coaching_response_json(raw_result)
    if result is None:
        log(
            "[Agno Chat Coach Agent] Coaching response composer primary model returned unusable output. "
            f"Falling back to {DEFAULT_RESPONSE_FALLBACK_MODEL} via {DEFAULT_RESPONSE_FALLBACK_MODEL_URL}"
        )
        fallback_run_output = _coaching_response_composer_fallback_agent().run(
            "\n".join(
                [
                    "Compose the final coaching response for the learner.",
                    "Use the supplied prepared context, learner profile, affect signal, and final intent.",
                    "If the learner asks for a practical example, include one when the context reasonably supports it.",
                    "If the learner already knows the basics, do not repeat beginner material.",
                    "Structured coaching input:",
                    json.dumps(composer_payload, ensure_ascii=False, indent=2),
                ]
            )
        )
        fallback_raw_result = _extract_main_model_text(fallback_run_output)
        _log_json_block(
            log,
            "[Agno Chat Coach Agent] Coaching response composer fallback model text:",
            fallback_raw_result,
        )
        result = _parse_coaching_response_json(fallback_raw_result)
        if result is None:
            log(
                "[Agno Chat Coach Agent] Coaching response composer fallback model text could not be parsed into CoachingResponse."
            )
            result = CoachingResponse(
                answer="I can see this feels frustrating. Based on the available context, the best next step is to focus on the concrete sequence, the key decision points, and the signals that show whether the result is correct. If you want, I can walk through it step by step.",
                why_this_answer="Fallback response used because both the primary and fallback structured composers did not return valid output.",
                focus_points=["Concrete sequence", "Key decision points", "What to focus on next"],
                follow_up_prompts=[
                    "Can you show me a short example?",
                    "What mistakes should I avoid?",
                ],
                supporting_context=prepared_support[:3],
            )

    answer_text = _clean_text(result.answer)
    supporting_memories = [{"text": item} for item in result.supporting_context if _clean_text(item)]

    log(
        "[Agno Chat Coach Agent] Coaching response composer finished. "
        f"answerPreview={_one_line_preview(answer_text)}"
    )
    _log_json_block(
        log,
        "[Agno Chat Coach Agent] Coaching response composer result:",
        result.model_dump(),
    )
    return StepOutput(
        content={
            **previous_content,
            "success": True,
            "workflowName": "chat-coach-agent",
            "action": "compose_coaching_response",
            "answer": answer_text,
            "structuredAnswer": result.model_dump(),
            "supportingMemories": supporting_memories,
        },
        success=True,
    )
