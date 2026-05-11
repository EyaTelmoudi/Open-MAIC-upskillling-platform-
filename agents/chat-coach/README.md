# Chat Coach Agent

This workspace hosts the separate AgentOS service for the Chat Coach agent.

Phase 1 responsibilities:
- receive a tenant-aware course question from the platform
- ask Hindsight `reflect` against the tenant course bank
- print the answer in the terminal
- print the retrieved `based_on` memories as proof

Optional visual inspection with Agno UI / Control Plane:
- the Chat Coach AgentOS service runs locally on `http://127.0.0.1:8012`
- it is now identified as `openmaic-chat-coach-agentos`
- browser origins for `https://os.agno.com` and local frontend dev hosts are allowed
- after the service is running, open the Agno control plane / playground and connect this local AgentOS endpoint if you want to inspect workflow runs visually
- if you want richer tracing/history later, add an AgentOS database-backed tracing setup before enabling long-term observability

Local connect checklist:
1. start the platform and trigger the coach once so the AgentOS service boots
2. verify `http://127.0.0.1:8012/health` returns success
3. open the Agno control plane / playground
4. connect the local AgentOS runtime at `http://127.0.0.1:8012`
5. run a coach request and inspect the workflow activity there

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
