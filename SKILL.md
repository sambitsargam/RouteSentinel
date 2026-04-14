# RouteSentinel Skill

RouteSentinel is a user-protection swap agent for X Layer and other EVM chains.

## What This Skill Does

- Finds tradable candidates from live on-chain signals.
- Filters with security checks (token scan + tx scan).
- Validates route quality using forward + reverse quote checks.
- Executes only micro-tests under strict notional caps.
- Produces audit + proof artifacts for transparent verification.

## Core User Outcomes

- Safer token selection for real users.
- Better execution quality by rejecting poor routes.
- Clear proof trail for trust and hackathon judging.

## Quick Start

1. Dry-run judge flow (recommended first):

```bash
npm run judge -- --wallet <wallet> --chain xlayer
```

2. Live micro-test judge flow (requires explicit confirmation):

```bash
npm run judge -- --wallet <wallet> --chain xlayer --confirm-live yes
```

3. Interactive user wizard:

```bash
npm run wizard
```

## Safety Defaults

- `MAX_TEST_USD=0.30`
- Phase C is dry-run unless `--confirm-live yes`
- Execution blocked on critical token or tx risk

## Output Artifacts

- `proof/reports/*` for all machine-readable reports
- `proof/reports/scoreboard.md` for aggregate execution metrics
- `submission/*-judge-run.md` for judge-ready run summaries
