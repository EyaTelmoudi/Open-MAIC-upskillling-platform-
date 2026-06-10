from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = Path(__file__).resolve().parent
PACKAGES_DIR = EVAL_DIR / "packages"
if str(PACKAGES_DIR) not in sys.path:
    sys.path.insert(0, str(PACKAGES_DIR))

from datasets import Dataset
from dotenv import dotenv_values
from langchain_openai import ChatOpenAI
from ragas import evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import AspectCritic, FactualCorrectness, Faithfulness, RubricsScore


def _load_openrouter_key() -> str:
    env = {
        **dotenv_values(ROOT / "upskilling_platform" / ".env"),
        **os.environ,
    }
    api_key = env.get("OPENROUTER_API_KEY") or env.get("AI_COACHING_AGENT_2_MODEL_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is missing. Add it to upskilling_platform/.env or the shell environment.")
    return str(api_key)


def _load_model_name() -> str:
    env = {
        **dotenv_values(ROOT / "upskilling_platform" / ".env"),
        **os.environ,
    }
    return str(env.get("RAGAS_EVAL_MODEL") or env.get("AI_COACHING_AGENT_2_MODEL") or "openai/gpt-4o-mini")


def _build_metrics() -> list[Any]:
    pedagogical_usefulness = AspectCritic(
        name="pedagogical_usefulness",
        definition=(
            "Return 1 if the response is useful for an upskilling platform learner or administrator: "
            "it should be clear, actionable, aligned with the user's learning need, and not generic. "
            "Return 0 otherwise."
        ),
        strictness=1,
    )
    platform_alignment = AspectCritic(
        name="platform_alignment",
        definition=(
            "Return 1 if the response respects the platform workflow: tenant-aware learning, "
            "course progress, learner memory, recommendations, challenges, or editable course drafts. "
            "Return 0 if it ignores the platform context."
        ),
        strictness=1,
    )
    rubric = RubricsScore(
        name="overall_quality",
        rubrics={
            "score1_description": "Incorrect, generic, or not usable in the platform.",
            "score2_description": "Partially relevant but missing important platform or pedagogical constraints.",
            "score3_description": "Mostly relevant with some omissions or weak grounding.",
            "score4_description": "Clear, grounded, and useful with only minor omissions.",
            "score5_description": "Fully grounded, actionable, pedagogically appropriate, and aligned with the platform workflow.",
        },
    )
    return [
        Faithfulness(),
        FactualCorrectness(mode="f1"),
        pedagogical_usefulness,
        platform_alignment,
        rubric,
    ]


def _to_markdown(rows: list[dict[str, Any]], summary: dict[str, Any]) -> str:
    lines = [
        "# RAGAS evaluation - Upskilling Platform AI agents",
        "",
        f"- Date: {datetime.now(timezone.utc).isoformat()}",
        f"- RAGAS dataset size: {len(rows)} samples",
        "- Metrics: faithfulness, factual correctness, pedagogical usefulness, platform alignment, overall quality",
        "",
        "## Summary",
        "",
        "| Metric | Score |",
        "|---|---:|",
    ]
    for key, value in summary.items():
        if isinstance(value, (int, float)):
            lines.append(f"| {key} | {value:.3f} |")
    lines.extend(
        [
            "",
            "## Per-agent scores",
            "",
            "| Agent | Faithfulness | Factual correctness | Pedagogical usefulness | Platform alignment | Overall quality |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for row in rows:
        lines.append(
            "| {agent} | {faithfulness:.3f} | {factual_correctness:.3f} | "
            "{pedagogical_usefulness:.3f} | {platform_alignment:.3f} | {overall_quality:.3f} |".format(
                agent=row.get("agent", ""),
                faithfulness=float(row.get("faithfulness") or 0),
                factual_correctness=float(row.get("factual_correctness") or 0),
                pedagogical_usefulness=float(row.get("pedagogical_usefulness") or 0),
                platform_alignment=float(row.get("platform_alignment") or 0),
                overall_quality=float(row.get("overall_quality") or 0),
            )
        )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "- Faithfulness measures whether the answer stays supported by the provided context.",
            "- Factual correctness compares the answer with the reference expected behavior.",
            "- Pedagogical usefulness checks whether the answer is actionable for learning.",
            "- Platform alignment checks whether the answer respects the platform workflows.",
            "- Overall quality is a 1 to 5 rubric score.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    data_path = EVAL_DIR / "evaluation_dataset.json"
    rows = json.loads(data_path.read_text(encoding="utf-8"))
    dataset = Dataset.from_list(rows)

    api_key = _load_openrouter_key()
    model_name = _load_model_name()
    llm = LangchainLLMWrapper(
        ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=0,
            timeout=120,
            max_retries=1,
            default_headers={
                "HTTP-Referer": "http://localhost:3001",
                "X-Title": "OpenMAIC Upskilling Platform RAGAS Evaluation",
            },
        )
    )

    result = evaluate(
        dataset=dataset,
        metrics=_build_metrics(),
        llm=llm,
        raise_exceptions=False,
        show_progress=True,
    )

    result_df = result.to_pandas()
    result_rows = json.loads(result_df.to_json(orient="records", force_ascii=False))
    for index, row in enumerate(result_rows):
        row["agent"] = rows[index].get("agent", "") if index < len(rows) else ""
        if "factual_correctness(mode=f1)" in row and "factual_correctness" not in row:
            row["factual_correctness"] = row["factual_correctness(mode=f1)"]
    metric_columns = [
        "faithfulness",
        "factual_correctness",
        "pedagogical_usefulness",
        "platform_alignment",
        "overall_quality",
    ]
    summary = {
        column: float(result_df[column].mean())
        for column in metric_columns
        if column in result_df.columns
    }
    if "factual_correctness(mode=f1)" in result_df.columns:
        summary["factual_correctness"] = float(result_df["factual_correctness(mode=f1)"].mean())

    out_json = EVAL_DIR / "ragas_results.json"
    out_md = EVAL_DIR / "ragas_results.md"
    out_json.write_text(
        json.dumps(
            {
                "model": model_name,
                "dataset_size": len(rows),
                "summary": summary,
                "rows": result_rows,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    out_md.write_text(_to_markdown(result_rows, summary), encoding="utf-8")
    print(f"Wrote {out_json}")
    print(f"Wrote {out_md}")


if __name__ == "__main__":
    main()
