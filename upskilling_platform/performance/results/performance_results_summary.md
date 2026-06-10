# Performance Test Results

Date: 2026-06-09

Tool: k6 executed through Docker image `grafana/k6:latest`.

Test account: `user2@3s.com.tn` on tenant `3s`.

## API Response Time By Load Tier

| VU | Requests | Error rate | Avg | Median | p95 | p99 | Max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 176 | 0% | 45.43 ms | 11.19 ms | 235.06 ms | 311.23 ms | 661.32 ms |
| 5 | 920 | 0% | 40.80 ms | 10.92 ms | 234.60 ms | 247.37 ms | 277.82 ms |
| 10 | 1792 | 0% | 46.13 ms | 11.88 ms | 238.82 ms | 271.32 ms | 404.16 ms |
| 20 | 3336 | 0% | 58.36 ms | 18.32 ms | 255.07 ms | 281.53 ms | 751.16 ms |
| 25 | 3336 | 0% | 105.45 ms | 62.28 ms | 284.74 ms | 866.90 ms | 1164.05 ms |

## Progression And Gamification

| VU | Requests | Error rate | Avg | Median | p95 | p99 | Max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 20 | 0% | 78.49 ms | 30.39 ms | 227.63 ms | 231.35 ms | 232.29 ms |
| 5 | 100 | 0% | 101.45 ms | 45.00 ms | 249.83 ms | 262.96 ms | 266.39 ms |
| 10 | 200 | 0% | 125.79 ms | 56.40 ms | 361.56 ms | 572.72 ms | 580.63 ms |

## Notifications WebSocket

| VU | HTTP requests | WS sessions | Check success | HTTP p95 | WS connect p95 | Max |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 7 | 7 | 100% | 245.69 ms | 68.33 ms | 248.66 ms |
| 5 | 35 | 35 | 100% | 267.38 ms | 15.22 ms | 267.88 ms |
| 10 | 70 | 70 | 100% | 290.45 ms | 19.57 ms | 329.40 ms |
| 20 | 140 | 140 | 100% | 602.10 ms | 20.46 ms | 733.22 ms |

## AI Agents

| VU | Requests | Error rate | Check success | Avg | p95 | p99 | Max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3 | 0% | 100% | 2988.56 ms | 7884.85 ms | 8575.97 ms | 8748.75 ms |
| 3 | 9 | 0% | 100% | 6519.02 ms | 19501.22 ms | 19501.22 ms | 19501.22 ms |
| 5 | 15 | 26.67% | 73.33% | 9446.95 ms | 29999.39 ms | 29999.58 ms | 29999.63 ms |

## Interpretation

- The classic backend API endpoints stayed stable from 1 to 25 VU, with 0% HTTP error rate and p95 below 300 ms.
- The progression and gamification workflow remained stable up to 10 VU in the tested scenario, with 0% error rate and p95 below 400 ms.
- Notification WebSocket connections succeeded in all tested attempts. At 20 VU, the WebSocket connection p95 remained around 20 ms, while the login HTTP p95 reached about 602 ms.
- AI agent calls are slower by nature because they trigger agent workflows. The 5 VU tier showed degradation, with 26.67% failed HTTP requests caused by request timeouts.

## Files

- k6 script: `performance/k6_platform_performance.js`
- Tiered API summaries: `performance/results/api_*vu_summary.json`
- Tiered progression/gamification summaries: `performance/results/progress_*vu_summary.json`
- Tiered notification summaries: `performance/results/notifications_*vu_summary.json`
- Tiered AI agent summaries: `performance/results/agents_*vu_summary.json`
