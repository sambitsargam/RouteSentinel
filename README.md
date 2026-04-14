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

# Phase C auto-selection
npm run scout -- --chain <chain> [--max-candidates 12]
npm run phasec -- --from <from_token> --amount <ui_amount> --chain <chain> --wallet <wallet> [--quality-candidates 4] [--to <to_token>] [--confirm-live yes]

# Judge + user flows
npm run judge -- --wallet <wallet> --chain <chain> [--confirm-live yes]
npm run wizard
```

## What Phase B Adds

- `intel`: token intelligence score using security scan + market + smart-money signal + leaderboard + tracker data.
- `execute`: pre-execution `tx-scan` guard before submitting a live swap.
- `proofboard`: auto-generates `proof/reports/scoreboard.md` + JSON summary from all run artifacts.
- `phaseb`: one-command pipeline (`intel -> execute -> audit -> proofboard`) with live-confirm requirement.

## What Phase C Adds

- `scout`: auto-builds a ranked token shortlist from live signal, leaderboard, and tracker feeds.
- `phasec`: auto-picks the best candidate and prepares a dry-run by default.
- `phasec` uses route-quality checks (forward quote + reverse quote) so token choice is based on execution viability, not only signal score.

## Judge/User Packaging

- `SKILL.md`: quick skill-style guide for operators.
- `SUBMISSION.md`: final hackathon submission narrative.
- `judge` command: one-command run that executes phase flow + writes a judge-ready report in `submission/`.
- `wizard` command: minimal interactive UI for non-technical users.
- `phasec` only executes a live swap when `--confirm-live yes` is explicitly passed.

## Safety Guardrails

- Hard cap for live test notional: `MAX_TEST_USD=0.30` (default).
- Any simulation above cap is blocked before execution.
- Critical token-scan risk blocks simulation/execution.
- Critical `tx-scan` risk blocks execution.
- `phaseb` command is blocked unless `--confirm-live yes` is passed.
- `phaseb` also blocks on `intel` verdict `avoid` unless explicitly overridden with `--force-intel yes`.
- `phasec` defaults to dry-run mode and does not spend funds unless `--confirm-live yes` is passed.
- `judge` defaults to dry-run and only goes live with `--confirm-live yes`.
- Reports are saved to `proof/reports/`.

## Env Setup

Copy `.env.example` to `.env` and adjust if needed:

```bash
cp .env.example .env
```

Default values:

```env
MAX_TEST_USD=0.30
ONCHAINOS_BIN=onchainos
```

If `onchainos` is not in your shell `PATH`, set `ONCHAINOS_BIN` to your local absolute binary path.
