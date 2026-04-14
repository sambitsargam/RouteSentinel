# RouteSentinel

SkillArena MVP for execution-aware swaps with strict micro-test risk controls.

## Core Commands

```bash
npm run plan -- --from <from_token> --to <to_token> --amount <ui_amount> --chain <chain> [--wallet <wallet>]
npm run simulate -- --from <from_token> --to <to_token> --amount <ui_amount> --chain <chain>
npm run execute -- --from <from_token> --to <to_token> --amount <ui_amount> --chain <chain> --wallet <wallet>
npm run audit -- [--file <proof/reports/...-execute.json>]
```

## Safety Guardrail

- Hard cap for live test notional: `MAX_TEST_USD=0.30` (default).
- Any simulation above cap is blocked before execution.
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
