# Chat Coach Agent

This workspace hosts the separate AgentOS service for the Chat Coach agent.

Phase 1 responsibilities:
- receive a tenant-aware course question from the platform
- ask Hindsight `reflect` against the tenant course bank
- print the answer in the terminal
- print the retrieved `based_on` memories as proof

Coach mode judge configuration:
- default provider shape is OpenAI-compatible `POST /chat/completions`
- default endpoint is `https://openrouter.ai/api/v1/chat/completions`
- default model is `openai/gpt-oss-120b:free`
- set `OPENAI_API_KEY` and optionally `OPENAI_BASE_URL` to enable the judge
- optional overrides:
  - `COACH_MODE_JUDGE_URL`
  - `COACH_MODE_JUDGE_API_KEY`
  - `COACH_MODE_JUDGE_MODEL`

Resolution order:
- if `COACH_MODE_JUDGE_URL` is set, the agent uses it directly
- otherwise it uses `OPENAI_BASE_URL + /chat/completions`
- if no API key is available, the workflow falls back to rules-only mode
