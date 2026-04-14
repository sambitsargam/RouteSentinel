---
name: routesentinel-skill
version: 1.0.0
description: "Execution-aware swap safety skill for X Layer using OnchainOS with route-quality checks, risk gates, and audit proofs."
homepage: https://github.com/sambitsargam/RouteSentinel
metadata:
  category:
    - SkillArena
    - swap-safety
  chains:
    - xlayer
    - base
  stack:
    - onchainos
    - uniswap
---

# RouteSentinel Skill

## Use This Skill When

- You need safer token selection before executing swaps.
- You want a micro-test execution workflow with strict spend limits.
- You need proof artifacts for hackathon judging and public transparency.

## Prerequisites

1. Install dependencies and configure `.env`:

```bash
cp .env.example .env
npm install
```

2. Ensure `onchainos` is available:

```bash
onchainos --version
```

3. Set your wallet and API configuration (outside source control).

## Core Commands

```bash
# Candidate scouting + route-quality dry run (default)
npm run phasec -- --from <from_token> --amount <ui_amount> --chain xlayer --wallet <wallet>

# Live micro-test only with explicit confirmation
npm run phasec -- --from <from_token> --amount <ui_amount> --chain xlayer --wallet <wallet> --confirm-live yes

# Judge-ready one-command flow
npm run judge -- --wallet <wallet> --chain xlayer
npm run judge -- --wallet <wallet> --chain xlayer --confirm-live yes

# Non-technical interactive flow
npm run wizard
```

## Safety Policy

- Default max test notional is capped by `MAX_TEST_USD=0.30`.
- Live execution is blocked unless `--confirm-live yes` is passed.
- Critical token-scan risk blocks simulation/execution.
- Critical tx-scan risk blocks execution.

## Evidence Outputs

- Machine reports: `proof/reports/*.json`
- Aggregate scoreboard: `proof/reports/scoreboard.md`
- Judge summaries: `submission/*-judge-run.md`

## SkillArena Notes

- This skill is designed for reusable integration by other agents.
- Keep command interface stable and output schema predictable.
- Include public proof logs in submissions to improve engagement and trust.
