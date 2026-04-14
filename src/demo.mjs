#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decideFirewall, formatDecisionSummary } from "./decision-engine.mjs";

const ROOT = process.cwd();
const AGENT_DIR = path.join(ROOT, "proof", "agent");
fs.mkdirSync(AGENT_DIR, { recursive: true });

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function extractJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const payload = start >= 0 && end >= start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function nowStamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function runSyntheticCase({ id, title, analysis, policy }) {
  const decision = decideFirewall({ analysis, policy });
  const result = {
    id,
    title,
    mode: "synthetic",
    decision,
    summary: formatDecisionSummary(decision),
    analysis
  };

  console.log(`\n[demo][${id}] ${title}`);
  console.log(`[demo][${id}] ${result.summary}`);
  console.log(`[demo][${id}] ${decision.humanExplanation}`);

  return result;
}

function runLiveCase({ wallet, from, amount, chain, safeToken, uniswapMode }) {
  if (!wallet) {
    return {
      id: "case-3",
      title: "Safe route -> EXECUTED via Uniswap",
      mode: "live",
      skipped: true,
      reason: "Missing --wallet for live execution",
      decision: {
        status: "SKIPPED",
        code: "LIVE_WALLET_REQUIRED",
        humanExplanation: "Live case skipped. Provide --wallet to execute on-chain."
      }
    };
  }

  const args = [
    "src/agent.mjs",
    "run",
    "--wallet",
    wallet,
    "--from",
    from,
    "--amount",
    amount,
    "--chain",
    chain,
    "--mode",
    "live",
    "--iterations",
    "1",
    "--max-attempts",
    "1",
    "--uniswap-mode",
    uniswapMode
  ];

  if (safeToken) {
    args.push("--to", safeToken);
  }

  const proc = spawnSync("node", args, {
    encoding: "utf8",
    stdio: "pipe"
  });

  const raw = `${proc.stdout || ""}${proc.stderr || ""}`.trim();
  const parsed = extractJson(raw);

  if (proc.status !== 0 || !parsed?.ok) {
    return {
      id: "case-3",
      title: "Safe route -> EXECUTED via Uniswap",
      mode: "live",
      skipped: false,
      decision: {
        status: "REJECT",
        code: "LIVE_EXECUTION_FAILED",
        humanExplanation: parsed?.error || raw || "Live execution failed."
      },
      raw
    };
  }

  const first = Array.isArray(parsed.results) ? parsed.results[0] || null : null;
  const status = first?.decision || "UNKNOWN";
  const code = first?.code || "UNKNOWN";

  const result = {
    id: "case-3",
    title: "Safe route -> EXECUTED via Uniswap",
    mode: "live",
    skipped: false,
    decision: {
      status,
      code,
      humanExplanation:
        status === "APPROVE" && first?.executed
          ? "APPROVED and executed on-chain."
          : "Decision completed. Check agent logs for details."
    },
    execution: first,
    files: parsed.files || null
  };

  console.log(`\n[demo][case-3] ${result.title}`);
  console.log(
    `[demo][case-3] decision=${status} | code=${code} | executed=${first?.executed ? "yes" : "no"}`
  );
  if (first?.txHash) {
    console.log(`[demo][case-3] tx=${first.txHash}`);
  }

  return result;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const live = String(opts.live || "no").toLowerCase() === "yes";

  const policy = {
    minRoundTripRatio: 0.99,
    maxLossPercent: 1.0,
    uniswapMode: String(opts["uniswap-mode"] || "prefer").toLowerCase()
  };

  const syntheticCases = [
    {
      id: "case-1",
      title: "Detected honeypot token -> BLOCKED",
      analysis: {
        candidateToken: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        routecheck: {
          metrics: { roundTripRatio: 0.9985, roundTripLossPercent: 0.15 },
          recommendation: { allow: true }
        },
        preview: {
          guardrails: { notionalUsd: 0.12 },
          tokenScanSnapshot: {
            isHoneypot: true,
            isRiskToken: true,
            isRubbishAirdrop: false
          },
          txScanGuard: { blocked: false, riskCount: 0 },
          executionHints: {
            dexNames: ["Uniswap V3"],
            hasUniswapRoute: true
          }
        }
      }
    },
    {
      id: "case-2",
      title: "Route inefficiency detected -> BLOCKED",
      analysis: {
        candidateToken: "0xbadroutebadroutebadroutebadroutebadroute",
        routecheck: {
          metrics: { roundTripRatio: 0.9123, roundTripLossPercent: 8.77 },
          recommendation: {
            allow: false,
            verdict: "reject"
          }
        },
        preview: {
          guardrails: { notionalUsd: 0.11 },
          tokenScanSnapshot: {
            isHoneypot: false,
            isRiskToken: false,
            isRubbishAirdrop: false
          },
          txScanGuard: { blocked: false, riskCount: 0 },
          executionHints: {
            dexNames: ["Uniswap V3"],
            hasUniswapRoute: true
          }
        }
      }
    }
  ];

  const results = syntheticCases.map((item) => runSyntheticCase({ ...item, policy }));

  if (live) {
    results.push(
      runLiveCase({
        wallet: opts.wallet ? String(opts.wallet) : "",
        from: String(opts.from || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
        amount: String(opts.amount || "0.0025"),
        chain: String(opts.chain || "xlayer"),
        safeToken: opts["safe-token"] ? String(opts["safe-token"]) : "",
        uniswapMode: policy.uniswapMode
      })
    );
  } else {
    results.push(
      runSyntheticCase({
        id: "case-3",
        title: "Safe route -> EXECUTED via Uniswap",
        policy,
        analysis: {
          candidateToken: "0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed",
          routecheck: {
            metrics: { roundTripRatio: 0.9979, roundTripLossPercent: 0.21 },
            recommendation: { allow: true, verdict: "approve" }
          },
          preview: {
            guardrails: { notionalUsd: 0.13 },
            tokenScanSnapshot: {
              isHoneypot: false,
              isRiskToken: false,
              isRubbishAirdrop: false
            },
            txScanGuard: { blocked: false, riskCount: 0 },
            executionHints: {
              dexNames: ["Uniswap V3"],
              hasUniswapRoute: true
            }
          }
        }
      })
    );
  }

  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    mode: live ? "live_case3" : "synthetic_only",
    cases: results
  };

  const file = path.join(AGENT_DIR, `${nowStamp()}-demo.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`\n[demo] report=${file}`);
  console.log(JSON.stringify({ ok: true, file, mode: payload.mode }, null, 2));
}

main();
