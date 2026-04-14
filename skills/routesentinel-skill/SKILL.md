---
name: routesentinel-skill
version: 1.1.0
description: "Autonomous trade firewall for X Layer using OnchainOS + Uniswap-aware route policy, with fail-closed execution and proof artifacts."
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

- You need an autonomous trade firewall before any swap execution.
- You want agent decisions (`APPROVE` / `REJECT`) with explicit reasoning.
- You need reproducible proof artifacts for judges and users.

## Quick Start (Required Order)

1. Install `onchainos` CLI (if missing):

```bash
onchainos --version || curl -fsSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
```

2. Install OnchainOS skills:

```bash
npx skills add okx/onchainos-skills --yes --global
```

3. Install Uniswap AI skills:

```bash
npx skills add Uniswap/uniswap-ai --yes --global
```

4. Get your OnchainOS API key from the Dev Portal:

- https://web3.okx.com/onchainos/dev-portal

5. Install and configure your Agentic Wallet:

- https://web3.okx.com/onchainos/dev-docs/wallet/install-your-agentic-wallet

6. Prepare this project:

```bash
cp .env.example .env
npm install
```

7. Configure environment values in `.env`:

- `ONCHAINOS_API_KEY=<your_key>`
- `ONCHAINOS_BIN=onchainos`
- `MAX_TEST_USD=0.30`

8. Start with dry-run flow first:

```bash
npm run judge -- --wallet <wallet> --chain xlayer
```

## Core Commands

```bash
# Firewall primitives
npm run routecheck -- --from <from_token> --to <to_token> --amount <ui_amount> --chain xlayer
npm run preview -- --from <from_token> --to <to_token> --amount <ui_amount> --chain xlayer --wallet <wallet>

# Autonomous agent loop
npm run agent -- --wallet <wallet> --mode dry --iterations 3 --interval-sec 10
npm run agent -- --wallet <wallet> --mode live --iterations 3 --interval-sec 60 --uniswap-mode prefer

# 3-case demo flow
npm run demo
npm run demo -- --live yes --wallet <wallet> --safe-token <to_token>

# Judge-ready one-command flow
npm run judge -- --wallet <wallet> --chain xlayer
npm run judge -- --wallet <wallet> --chain xlayer --confirm-live yes
```

## Safety Policy

- Default max test notional is capped by `MAX_TEST_USD=0.30`.
- Live execution is blocked unless `--confirm-live yes` is passed.
- Critical token-scan risk blocks simulation/execution.
- Critical tx-scan risk blocks execution.

## Evidence Outputs

- Core machine reports: `proof/reports/*.json`
- Core aggregate scoreboard: `proof/reports/scoreboard.md`
- Agent decision logs: `proof/agent/*-decision.json`
- Agent decision stream: `proof/agent/decision-log.ndjson`
- Agent proofboard: `proof/agent/scoreboard.md`
- Judge summaries: `submission/*-judge-run.md`

## SkillArena Notes

- This skill is designed for reusable integration by other agents.
- Keep command interface stable and output schema predictable.
- Include public proof logs in submissions to improve engagement and trust.
