## Project Name
**Sentinel Agent** — Autonomous Trade Firewall for X Layer that blocks unsafe swaps before execution.

## Track
**Skill Arena**

## Contact
- Telegram: **@shakti0675**
- Email: **sambitsargam2003@gmail.com**

## Summary
Sentinel Agent is a reusable skill-first AI agent system that acts as a fail-closed decision firewall for autonomous trading on X Layer. For every trade intent, it runs route-quality validation, token risk scan, and tx risk scan before execution. Unsafe trades are rejected with explicit reasoning; safe trades are approved and executed with proof logs for judges and users.

## What I Built
I upgraded RouteSentinel from a safety utility into a full agent loop:
- **Analyze -> Decide -> Act -> Log**
- decision outcomes: `APPROVE` or `REJECT`
- adaptive retry across candidate tokens/routes
- dry and live modes for controlled execution
- machine-readable proofboard for every cycle

This directly solves a real pain point for autonomous agents: preventing financial loss *before* signing transactions.

## How It Functions
1. **Intent intake** (manual token or autonomous candidate queue)
2. **Pre-trade route firewall** (`routecheck`)
3. **Pre-exec security firewall** (`preview` with token scan + tx scan)
4. **Decision engine** (rule-based fail-closed policy)
5. **Action**
   - `APPROVE` -> execute (live mode)
   - `REJECT` -> block + explain + retry next candidate
6. **Proof logging**
   - decision json per cycle
   - ndjson stream
   - scoreboard markdown/json

## OnchainOS / Uniswap Integration
- **Module(s) used:**
  - OnchainOS: Wallet / DEX / Security / Data
  - Uniswap AI Skills (installed and integrated in route policy)
- **How integrated:**
  - Route + price pathing: `swap quote`, `swap swap`, `swap execute`
  - Security gates: `security token-scan`, `security tx-scan`
  - Candidate intelligence: `signal list`, `leaderboard list`, `tracker activities`
  - Uniswap-aware policy in firewall:
    - `--uniswap-mode off|prefer|required`
    - route metadata inspection for Uniswap route enforcement

## Proof of Work
- Agentic Wallet address: `0xd2f83a7ac9537d5392eaac58f0649c37825c8d74`
- GitHub repo: https://github.com/sambitsargam/RouteSentinel
- Deployment / live demo: CLI demo + autonomous agent loop (`npm run demo`, `npm run agent`)
- On-chain tx examples:
  - `0x77e54007313708b808c86163749f13e46bce754072379a042a4544aaf83d5fa6`
  - `0xa37c9d2c68368c9e488b4fe8348c34fee8089e0535be0c4777b35f118f5feac5`
  - `0x62106f435561236f864575997dd733fdf124291cb14594a5fd471198b4d139fe`
- Agent decision proof artifacts:
  - `proof/agent/scoreboard.md`
  - `proof/agent/decision-log.ndjson`
  - `proof/agent/*-decision.json`

## Why It Matters
Autonomous agents will keep growing, but unsafe execution is still the biggest blocker for real adoption. Sentinel Agent provides a reusable, agent-native safety firewall that turns opaque trading into accountable decision-making. It gives users and judges clear evidence of *why* a trade was blocked or approved, while keeping real on-chain execution possible when risk is acceptable.
