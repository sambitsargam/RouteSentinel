# Sentinel Agent

## AI Trade Firewall for Autonomous Agents on X Layer

`ProjectSubmission SkillArena`

Sentinel Agent is an autonomous decision firewall that evaluates every trade intent before execution.

It is built on top of RouteSentinel core safety primitives:

- candidate scouting
- route-quality validation (forward + reverse quote)
- token risk scanning
- transaction risk scanning
- fail-closed execution gates
- proofboard evidence outputs

This is not a passive safety checker.
This is an **active agent** that decides: `APPROVE` or `REJECT` before funds move.

---

## Problem

Autonomous agents can execute on-chain faster than humans, but unsafe routes, honeypots, and tx-level traps still cause real losses.

Most systems optimize for speed first, safety second.
Sentinel Agent flips this model:

- safety is the first decision,
- execution is allowed only after firewall approval.

---

## Solution

Sentinel Agent runs a deterministic decision loop:

`analyze -> decide -> act -> log`

For each trade intent:

1. Analyze route quality and risk
2. Decide using fail-closed policy
3. Execute only when approved
4. Log machine + human-readable reasoning for proof

---

## System Architecture

```text
+------------------------- Sentinel Agent Layer --------------------------+
|  Intent Input (user/autonomous)                                        |
|    -> Candidate Queue (manual token or auto phasec scout)              |
|    -> Decision Engine (rule-based firewall)                            |
|    -> Action (execute/reject/retry)                                    |
|    -> Decision Logs + Agent Proofboard                                 |
+------------------------------------------------------------------------+
               |                        |                        |
               v                        v                        v
+----------------------+   +----------------------+   +----------------------+
| RouteSentinel Core   |   | Execution Layer      |   | Proofboard Layer     |
| - scout              |   | - preview            |   | - decision json      |
| - routecheck         |   | - execute            |   | - decision ndjson    |
| - token scan         |   | - audit              |   | - agent scoreboard   |
| - tx scan            |   | - uniswap-aware mode |   | - existing reports   |
+----------------------+   +----------------------+   +----------------------+
```

---

## Agent Flow (Implementation)

```pseudo
for each cycle:
  intents = user_intent OR autonomous_candidate_queue
  for each candidate in intents:
    route = routecheck(candidate)
    preview = preview(candidate)
    decision = firewall(route, preview, policy)
    if decision == APPROVE:
      if mode == live: execute + audit
      break
    else:
      retry next candidate (adaptive fallback)
  write decision report + append ndjson + refresh agent scoreboard
```

---

## Uniswap Integration

Sentinel Agent is Uniswap-aware through route metadata from quote/preview.

Policy modes:

- `off`: no preference
- `prefer`: prefer Uniswap route but allow safe fallback
- `required`: block non-Uniswap route

Example:

```bash
npm run agent -- \
  --wallet <wallet> \
  --mode dry \
  --to <token> \
  --uniswap-mode required
```

---

## Demo (Hackathon Video Flow)

### Case 1: Detected honeypot token -> BLOCKED

- token scan critical risk
- decision: `REJECT/HONEYPOT_OR_TOKEN_RISK`
- no execution

### Case 2: Route inefficiency detected -> BLOCKED

- round-trip loss breaches threshold
- decision: `REJECT/ROUTE_INEFFICIENT`
- no execution

### Case 3: Safe route -> EXECUTED via Uniswap

- route + token + tx checks pass
- decision: `APPROVE/SAFE_TO_EXECUTE`
- on-chain execution in live mode

Run synthetic full demo:

```bash
npm run demo
```

Run demo with live case-3 execution:

```bash
npm run demo -- --live yes --wallet <wallet> --safe-token <token>
```

---

## Why This Wins

### 1) Skill Arena (Top 3)

- real on-chain execution path
- autonomous decision loop
- clear safety + execution + proof narrative

### 2) Most Popular Skill

- clear demo loop with reusable agent behavior
- proof artifacts improve trust and shareability for community voting

### 3) Best Uniswap Integration

- route-level Uniswap policy enforcement (`prefer` / `required`)
- execution decisions can be constrained to Uniswap routes

---

## Quick Start

### 1) Install prerequisites

```bash
onchainos --version || curl -fsSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
npx skills add okx/onchainos-skills --yes --global
npx skills add Uniswap/uniswap-ai --yes --global
cp .env.example .env
npm install
```

OnchainOS API key:
- https://web3.okx.com/onchainos/dev-portal

Agentic Wallet setup:
- https://web3.okx.com/onchainos/dev-docs/wallet/install-your-agentic-wallet

### 2) Base firewall commands

```bash
npm run routecheck -- --from <from> --to <to> --amount <amt> --chain xlayer
npm run preview -- --from <from> --to <to> --amount <amt> --chain xlayer --wallet <wallet>
```

### 3) Run autonomous agent (dry)

```bash
npm run agent -- --wallet <wallet> --mode dry --iterations 3 --interval-sec 10
```

### 4) Run autonomous agent (live)

```bash
npm run agent -- --wallet <wallet> --mode live --iterations 3 --interval-sec 60
```

### 5) Run judge flow

```bash
npm run judge -- --wallet <wallet> --chain xlayer
npm run judge -- --wallet <wallet> --chain xlayer --confirm-live yes
```

---

## Logging Format (Proofboard)

Decision record (`proof/agent/*-decision.json`) includes:

```json
{
  "command": "agent",
  "cycle": 1,
  "intent": { "from": "...", "to": "...", "amount": "..." },
  "decision": {
    "status": "APPROVE|REJECT",
    "code": "SAFE_TO_EXECUTE|HONEYPOT_OR_TOKEN_RISK|ROUTE_INEFFICIENT|...",
    "humanExplanation": "..."
  },
  "action": {
    "executed": true,
    "txHash": "0x...",
    "auditVerdict": "excellent"
  }
}
```

Aggregates:

- `proof/agent/decision-log.ndjson`
- `proof/agent/scoreboard.json`
- `proof/agent/scoreboard.md`

---

## Folder Structure

```text
src/
  cli.mjs                  # RouteSentinel core + new routecheck/preview
  decision-engine.mjs      # Firewall decision logic
  agent.mjs                # Autonomous agent loop
  demo.mjs                 # 3-case demo runner
  judge.mjs                # Judge report generator
  wizard.mjs               # Interactive flow
proof/
  reports/                 # existing execution/audit reports
  agent/                   # agent decision logs + scoreboard
skills/
  routesentinel-skill/     # plugin-store compatible skill package
```

---

## Core Scripts

```bash
npm run demo
npm run agent -- --wallet <wallet> --mode dry
npm run routecheck -- --from <from> --to <to> --amount <amt> --chain xlayer
npm run preview -- --from <from> --to <to> --amount <amt> --chain xlayer --wallet <wallet>
npm run execute -- --from <from> --to <to> --amount <amt> --chain xlayer --wallet <wallet>
npm run proofboard
npm run judge -- --wallet <wallet> --chain xlayer
```

---

## Positioning

This project is not just a swap safety tool.

It is an **Autonomous Agent Decision Firewall** that prevents financial loss before execution.

## Contact

- Telegram: `@shakti0675`
- GitHub: [sambitsargam/RouteSentinel](https://github.com/sambitsargam/RouteSentinel)

## License

MIT
