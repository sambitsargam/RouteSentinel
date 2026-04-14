# RouteSentinel

SkillArena MVP for execution-aware swaps with strict micro-test risk controls.

## Core Commands

```bash
npm run plan -- --from <from_token> --to <to_token> --amount <ui_amount> --chain <chain> [--wallet <wallet>]
npm run simulate -- --from <from_token> --to <to_token> --amount <ui_amount> --chain <chain>
npm run execute -- --from <from_token> --to <to_token> --amount <ui_amount> --chain <chain> --wallet <wallet> [--skip-tx-scan yes]
npm run audit -- [--file <proof/reports/...-execute.json>]

# Phase B intelligence and proof
npm run intel -- --to <to_token> --chain <chain>
npm run proofboard
npm run phaseb -- --from <from_token> --to <to_token> --amount <ui_amount> --chain <chain> --wallet <wallet> --confirm-live yes [--force-intel yes]
```

## What Phase B Adds

- `intel`: token intelligence score using security scan + market + smart-money signal + leaderboard + tracker data.
- `execute`: pre-execution `tx-scan` guard before submitting a live swap.
- `proofboard`: auto-generates `proof/reports/scoreboard.md` + JSON summary from all run artifacts.
- `phaseb`: one-command pipeline (`intel -> execute -> audit -> proofboard`) with live-confirm requirement.

## Safety Guardrails

- Hard cap for live test notional: `MAX_TEST_USD=0.30` (default).
- Any simulation above cap is blocked before execution.
- Critical token-scan risk blocks simulation/execution.
- Critical `tx-scan` risk blocks execution.
- `phaseb` command is blocked unless `--confirm-live yes` is passed.
- `phaseb` also blocks on `intel` verdict `avoid` unless explicitly overridden with `--force-intel yes`.
- Reports are saved to `proof/reports/`.

## Env Setup

Copy `.env.example` to `.env` and adjust if needed:

```bash
cp .env.example .env
```

Default values:

```env
MAX_TEST_USD=0.30
ONCHAINOS_BIN=/Users/sambit/.local/bin/onchainos
```
