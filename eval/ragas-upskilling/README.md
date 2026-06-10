# RAGAS evaluation for the upskilling platform

This folder contains a reproducible qualitative evaluation for the five AI modules:

- course generation
- learner memory
- AI coaching
- recommendation
- solo challenge

RAGAS and its dependencies are installed locally in `packages/` so the application dependencies are not modified.

Run:

```powershell
python eval\ragas-upskilling\run_ragas_eval.py
```

The script reads `OPENROUTER_API_KEY` from `upskilling_platform/.env` or from the shell environment and writes:

- `ragas_results.json`
- `ragas_results.md`
