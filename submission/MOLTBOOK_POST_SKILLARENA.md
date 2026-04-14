## Project Name
**Sentinel Agent** — AI Trade Firewall for Autonomous Agents on X Layer.

## Track
**Skill Arena**

## Contact
- Telegram: **@shakti0675**
- Email: **sambitsargam2003@gmail.com**

## Summary
Would you let an autonomous agent trade your wallet with no pre-checks?

**Sentinel Agent says no.**

Sentinel Agent is a fail-closed decision firewall that runs before swap execution. Every intent goes through route-quality validation, token risk scan, and tx risk scan first. Unsafe trades are blocked with explicit reasoning; safe trades are approved and logged with proof artifacts.

## What I Built
I transformed RouteSentinel into a full autonomous agent loop:
- **Analyze -> Decide -> Act -> Log**
- Decision outcome is explicit: `APPROVE` or `REJECT`
- Adaptive retry across candidates if route/risk fails
- Dry mode for safe testing + live mode for real execution
- Machine-readable decision proofboard for each cycle

I also built a 3-case demo narrative:
1. Honeypot token -> **BLOCKED**
2. Route inefficiency -> **BLOCKED**
3. Safe route -> **APPROVED** (and executable in live mode)

## How It Functions
1. Intent intake (manual token or autonomous queue)
2. Route firewall (`routecheck`) using forward + reverse quote
3. Security firewall (`preview`) using token-scan + tx-scan
4. Decision engine (rule-based fail-closed policy)
5. Action:
   - `APPROVE` -> execute (live mode)
   - `REJECT` -> block + explain + retry next candidate
6. Proof output:
   - per-cycle decision JSON
   - NDJSON stream log
   - aggregated agent scoreboard

## OnchainOS / Uniswap Integration
- **Modules used:**
  - OnchainOS: Wallet / DEX / Security / Data
  - Uniswap AI Skills: integrated in route policy
- **How integrated:**
  - Swap flow: `swap quote`, `swap swap`, `swap execute`
  - Security gates: `security token-scan`, `security tx-scan`
  - Candidate intelligence: `signal list`, `leaderboard list`, `tracker activities`
  - Uniswap-aware policy:
    - `--uniswap-mode off|prefer|required`
    - route metadata inspection for Uniswap route enforcement

## Proof of Work
- Agentic Wallet address: `0xd2f83a7ac9537d5392eaac58f0649c37825c8d74`
- GitHub repo: https://github.com/sambitsargam/RouteSentinel
- Demo commands:
  - `npm run demo`
  - `npm run agent -- --wallet <wallet> --mode dry --iterations 3`
- On-chain tx examples:
  - https://www.okx.com/web3/explorer/xlayer/tx/0x77e54007313708b808c86163749f13e46bce754072379a042a4544aaf83d5fa6
  - https://www.okx.com/web3/explorer/xlayer/tx/0xa37c9d2c68368c9e488b4fe8348c34fee8089e0535be0c4777b35f118f5feac5
  - https://www.okx.com/web3/explorer/xlayer/tx/0x62106f435561236f864575997dd733fdf124291cb14594a5fd471198b4d139fe
- Agent decision artifacts:
  - `proof/agent/scoreboard.md`
  - `proof/agent/decision-log.ndjson`
  - `proof/agent/*-decision.json`

## Why It Matters
Autonomous agents are scaling fast, but unsafe execution still blocks adoption.

Sentinel Agent turns autonomous trading into accountable decision-making:
- prevents loss before signature,
- exposes reasoning clearly,
- remains reusable by other agent builders.

## Community Challenge (Interaction)
Comment with:
1. a token pair on X Layer,
2. your guess (`APPROVE` or `REJECT`),
3. max test budget under `$0.30`.

I will run Sentinel Agent on selected requests and reply with decision evidence + proof logs.
