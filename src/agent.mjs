#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  decideFirewall,
  formatDecisionSummary
} from "./decision-engine.mjs";

const ROOT = process.cwd();
const AGENT_DIR = path.join(ROOT, "proof", "agent");
const DECISION_LOG_FILE = path.join(AGENT_DIR, "decision-log.ndjson");
fs.mkdirSync(AGENT_DIR, { recursive: true });

const USAGE = `
Sentinel Agent

Usage:
  node src/agent.mjs run --wallet <addr> [--to <token>] [--mode dry|live]

Core options:
  --wallet <addr>                 Required for preview/execution
  --from <token>                  Default: native token (0xeeee...)
  --to <token>                    If omitted, agent auto-selects via phasec
  --amount <ui_amount>            Default: 0.0025
  --chain <chain>                 Default: xlayer
  --mode <dry|live>               Default: dry
  --iterations <n>                Default: 1
  --interval-sec <n>              Default: 0
  --max-attempts <n>              Candidate retries per cycle (default: 3)
  --max-candidates <n>            Auto-scout candidate pool (default: 8)
  --quality-candidates <n>        Route-check shortlist size (default: 4)

Firewall policy options:
  --min-roundtrip-ratio <ratio>   Default: 0.99
  --max-loss-percent <pct>        Default: 1.0
  --uniswap-mode <prefer|required|off>  Default: prefer
`;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function runCli(command, args) {
  const proc = spawnSync("node", ["src/cli.mjs", command, ...args], {
    encoding: "utf8",
    stdio: "pipe"
  });

  const raw = `${proc.stdout || ""}${proc.stderr || ""}`.trim();
  const parsed = extractJson(raw);

  if (proc.status !== 0 || !parsed?.ok) {
    const message = parsed?.error || raw || `Command failed: ${command}`;
    const error = new Error(message);
    error.command = command;
    error.raw = raw;
    throw error;
  }

  return parsed;
}

function tryCli(command, args) {
  try {
    const result = runCli(command, args);
    return { ok: true, result, error: null };
  } catch (error) {
    return { ok: false, result: null, error: error.message };
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildCandidateSelection(opts) {
  if (opts.to) {
    return {
      source: "user_intent",
      queue: [opts.to],
      context: null
    };
  }

  const phasecArgs = [
    "--from",
    opts.from,
    "--amount",
    opts.amount,
    "--chain",
    opts.chain,
    "--wallet",
    opts.wallet,
    "--max-candidates",
    String(opts.maxCandidates),
    "--quality-candidates",
    String(opts.qualityCandidates)
  ];

  if (opts.include) {
    phasecArgs.push("--include", opts.include);
  }

  const phasecCall = tryCli("phasec", phasecArgs);
  if (!phasecCall.ok) {
    return {
      source: "autonomous_phasec",
      queue: [],
      context: { error: phasecCall.error }
    };
  }

  const phasecReport = phasecCall.result.report || {};
  const selectedToken = phasecReport.request?.to || null;
  const routeChecks = Array.isArray(phasecReport.selection?.routeChecks)
    ? phasecReport.selection.routeChecks
    : [];

  const ordered = unique([
    selectedToken,
    ...routeChecks.map((row) => row.tokenAddress)
  ]);

  return {
    source: "autonomous_phasec",
    queue: ordered,
    context: {
      file: phasecCall.result.file,
      selectedToken,
      routeChecks,
      mode: phasecReport.mode || "dry_run"
    }
  };
}

function buildRoutecheckArgs({ from, to, amount, chain, minRoundTripRatio, maxLossPercent }) {
  return [
    "--from",
    from,
    "--to",
    to,
    "--amount",
    amount,
    "--chain",
    chain,
    "--min-roundtrip-ratio",
    String(minRoundTripRatio),
    "--max-loss-percent",
    String(maxLossPercent)
  ];
}

function buildPreviewArgs({ from, to, amount, chain, wallet }) {
  return [
    "--from",
    from,
    "--to",
    to,
    "--amount",
    amount,
    "--chain",
    chain,
    "--wallet",
    wallet
  ];
}

function nowStamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function writeDecisionReport(runId, cycle, payload) {
  const file = path.join(AGENT_DIR, `${nowStamp()}-${runId}-cycle-${cycle}-decision.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const line = {
    createdAt: payload.createdAt,
    runId,
    cycle,
    decision: payload.decision?.status || null,
    code: payload.decision?.code || null,
    token: payload.intent?.to || null,
    mode: payload.mode,
    executed: Boolean(payload.action?.executed),
    txHash: payload.action?.txHash || null,
    notionalUsd: payload.analysis?.selectedAttempt?.preview?.guardrails?.notionalUsd ?? null
  };
  fs.appendFileSync(DECISION_LOG_FILE, `${JSON.stringify(line)}\n`, "utf8");

  return file;
}

function buildAgentScoreboard() {
  const files = fs
    .readdirSync(AGENT_DIR)
    .filter((name) => name.endsWith("-decision.json"))
    .sort();

  const rows = files
    .map((name) => {
      const file = path.join(AGENT_DIR, name);
      try {
        return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const totals = {
    decisions: rows.length,
    approved: 0,
    rejected: 0,
    executed: 0,
    dryApproved: 0
  };
  const reasonBreakdown = {};
  const recent = [];

  for (const row of rows) {
    const decisionStatus = row.data?.decision?.status || "REJECT";
    const code = row.data?.decision?.code || "UNKNOWN";
    const executed = Boolean(row.data?.action?.executed);

    if (decisionStatus === "APPROVE") totals.approved += 1;
    else totals.rejected += 1;

    if (executed) totals.executed += 1;
    else if (decisionStatus === "APPROVE") totals.dryApproved += 1;

    reasonBreakdown[code] = (reasonBreakdown[code] || 0) + 1;

    recent.push({
      createdAt: row.data?.createdAt || null,
      cycle: row.data?.cycle || null,
      decision: decisionStatus,
      code,
      token: row.data?.intent?.to || null,
      executed,
      txHash: row.data?.action?.txHash || null,
      mode: row.data?.mode || null
    });
  }

  const recentRows = recent.slice(-10).reverse();
  const scoreboardJson = {
    createdAt: new Date().toISOString(),
    totals,
    reasonBreakdown,
    recent: recentRows
  };

  const jsonFile = path.join(AGENT_DIR, "scoreboard.json");
  fs.writeFileSync(jsonFile, `${JSON.stringify(scoreboardJson, null, 2)}\n`, "utf8");

  const lines = [
    "# Sentinel Agent Proofboard",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Totals",
    `- Decisions: ${totals.decisions}`,
    `- Approved: ${totals.approved}`,
    `- Rejected: ${totals.rejected}`,
    `- Executed: ${totals.executed}`,
    `- Dry approved: ${totals.dryApproved}`,
    "",
    "## Reason Breakdown"
  ];

  for (const key of Object.keys(reasonBreakdown).sort()) {
    lines.push(`- ${key}: ${reasonBreakdown[key]}`);
  }

  lines.push(
    "",
    "## Recent Decisions",
    "| Time (UTC) | Cycle | Decision | Code | Token | Mode | Executed | Tx Hash |",
    "|---|---:|---|---|---|---|---|---|"
  );

  if (!recentRows.length) {
    lines.push("| - | - | - | - | - | - | - | - |");
  } else {
    for (const row of recentRows) {
      lines.push(
        `| ${row.createdAt || "-"} | ${row.cycle || "-"} | ${row.decision} | ${row.code} | ${row.token || "-"} | ${row.mode || "-"} | ${row.executed ? "yes" : "no"} | ${row.txHash || "-"} |`
      );
    }
  }

  const markdownFile = path.join(AGENT_DIR, "scoreboard.md");
  fs.writeFileSync(markdownFile, `${lines.join("\n")}\n`, "utf8");

  return { jsonFile, markdownFile, scoreboard: scoreboardJson };
}

function evaluateCandidate({ opts, candidateToken, policy }) {
  const routecheckCall = tryCli(
    "routecheck",
    buildRoutecheckArgs({
      from: opts.from,
      to: candidateToken,
      amount: opts.amount,
      chain: opts.chain,
      minRoundTripRatio: policy.minRoundTripRatio,
      maxLossPercent: policy.maxLossPercent
    })
  );

  const previewCall = tryCli(
    "preview",
    buildPreviewArgs({
      from: opts.from,
      to: candidateToken,
      amount: opts.amount,
      chain: opts.chain,
      wallet: opts.wallet
    })
  );

  const analysis = {
    candidateToken,
    routecheck: routecheckCall.result?.report || null,
    routecheckFile: routecheckCall.result?.file || null,
    routecheckError: routecheckCall.error,
    preview: previewCall.result?.report || null,
    previewFile: previewCall.result?.file || null,
    previewError: previewCall.error
  };

  const decision = decideFirewall({ analysis, policy });

  return {
    candidateToken,
    analysis,
    decision,
    summary: formatDecisionSummary(decision)
  };
}

function executeApproved({ opts, candidateToken }) {
  const executeCall = tryCli(
    "execute",
    buildPreviewArgs({
      from: opts.from,
      to: candidateToken,
      amount: opts.amount,
      chain: opts.chain,
      wallet: opts.wallet
    })
  );

  if (!executeCall.ok) {
    return {
      executed: false,
      error: executeCall.error,
      executeFile: null,
      txHash: null,
      auditFile: null,
      auditVerdict: null
    };
  }

  const executeReport = executeCall.result.report || {};
  const executeFile = executeCall.result.file || null;
  const txHash = executeReport.execution?.swapTxHash || null;

  const auditCall = tryCli("audit", ["--file", executeFile]);

  return {
    executed: true,
    error: null,
    executeFile,
    txHash,
    auditFile: auditCall.result?.file || null,
    auditVerdict: auditCall.result?.report?.verdict || null,
    auditError: auditCall.error || null
  };
}

async function runCycle({ runId, cycle, opts, policy }) {
  const selection = buildCandidateSelection(opts);
  const queue = selection.queue.slice(0, opts.maxAttempts);

  if (!queue.length) {
    const reject = {
      status: "REJECT",
      code: "NO_CANDIDATE_AVAILABLE",
      reason: "No candidate token available for evaluation.",
      nextAction: "Increase max candidates or provide --to token.",
      humanExplanation: "REJECTED: No candidate token available.",
      machine: {
        decision: "reject",
        code: "NO_CANDIDATE_AVAILABLE",
        reason: selection.context?.error || "empty_candidate_queue",
        details: {
          candidateToken: null
        }
      }
    };

    const payload = {
      command: "agent",
      runId,
      cycle,
      createdAt: new Date().toISOString(),
      mode: opts.mode,
      intent: {
        source: selection.source,
        from: opts.from,
        to: null,
        amount: opts.amount,
        chain: opts.chain,
        wallet: opts.wallet
      },
      selection,
      analysis: {
        attempts: [],
        selectedAttempt: null
      },
      decision: reject,
      action: {
        executed: false,
        skipped: true,
        txHash: null,
        executeFile: null,
        auditFile: null,
        auditVerdict: null,
        reason: "no_candidate"
      }
    };

    payload.files = {
      decisionFile: writeDecisionReport(runId, cycle, payload)
    };

    return payload;
  }

  const attempts = [];
  let selectedAttempt = null;

  for (const token of queue) {
    const attempt = evaluateCandidate({ opts, candidateToken: token, policy });
    attempts.push(attempt);
    if (attempt.decision.status === "APPROVE") {
      selectedAttempt = attempt;
      break;
    }
  }

  if (!selectedAttempt) {
    selectedAttempt = attempts[attempts.length - 1];
  }

  let action = {
    executed: false,
    skipped: true,
    txHash: null,
    executeFile: null,
    auditFile: null,
    auditVerdict: null,
    reason: "decision_rejected"
  };

  if (selectedAttempt.decision.status === "APPROVE") {
    if (opts.mode === "live") {
      action = executeApproved({ opts, candidateToken: selectedAttempt.candidateToken });
      if (!action.executed) {
        action.reason = "execute_failed";
      }
    } else {
      action = {
        ...action,
        reason: "dry_mode_no_execution",
        skipped: true
      };
    }
  }

  const payload = {
    command: "agent",
    runId,
    cycle,
    createdAt: new Date().toISOString(),
    mode: opts.mode,
    intent: {
      source: selection.source,
      from: opts.from,
      to: selectedAttempt.candidateToken,
      amount: opts.amount,
      chain: opts.chain,
      wallet: opts.wallet
    },
    selection,
    analysis: {
      attempts,
      selectedAttempt: selectedAttempt.analysis
    },
    decision: selectedAttempt.decision,
    action
  };

  payload.files = {
    decisionFile: writeDecisionReport(runId, cycle, payload)
  };

  console.log(`[agent][cycle ${cycle}] ${selectedAttempt.summary}`);
  if (payload.decision?.humanExplanation) {
    console.log(`[agent][cycle ${cycle}] ${payload.decision.humanExplanation}`);
  }
  if (payload.action?.executed && payload.action?.txHash) {
    console.log(`[agent][cycle ${cycle}] tx=${payload.action.txHash}`);
  }

  return payload;
}

async function main() {
  const command = process.argv[2] || "run";
  const optsRaw = parseArgs(process.argv.slice(3));

  if (["-h", "--help", "help"].includes(command)) {
    console.log(USAGE.trim());
    process.exit(0);
  }

  if (command !== "run") {
    throw new Error(`Unknown command: ${command}`);
  }

  if (!optsRaw.wallet) {
    throw new Error("Missing required option --wallet");
  }

  const opts = {
    wallet: String(optsRaw.wallet),
    from: String(
      optsRaw.from || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    ),
    to: optsRaw.to ? String(optsRaw.to) : null,
    amount: String(optsRaw.amount || "0.0025"),
    chain: String(optsRaw.chain || "xlayer"),
    mode: String(optsRaw.mode || "dry").toLowerCase() === "live" ? "live" : "dry",
    iterations: Math.max(1, toInt(optsRaw.iterations, 1)),
    intervalSec: Math.max(0, toInt(optsRaw["interval-sec"], 0)),
    maxAttempts: Math.max(1, toInt(optsRaw["max-attempts"], 3)),
    maxCandidates: Math.max(1, toInt(optsRaw["max-candidates"], 8)),
    qualityCandidates: Math.max(1, toInt(optsRaw["quality-candidates"], 4)),
    include: optsRaw.include ? String(optsRaw.include) : null
  };

  const policy = {
    minRoundTripRatio: toNumber(optsRaw["min-roundtrip-ratio"], 0.99),
    maxLossPercent: toNumber(optsRaw["max-loss-percent"], 1.0),
    uniswapMode: String(optsRaw["uniswap-mode"] || "prefer").toLowerCase()
  };

  const runId = `${Date.now().toString(36)}`;
  const cycles = [];

  for (let cycle = 1; cycle <= opts.iterations; cycle += 1) {
    const cycleReport = await runCycle({ runId, cycle, opts, policy });
    cycles.push(cycleReport);

    if (cycle < opts.iterations && opts.intervalSec > 0) {
      await sleep(opts.intervalSec * 1000);
    }
  }

  const board = buildAgentScoreboard();

  const result = {
    ok: true,
    runId,
    mode: opts.mode,
    policy,
    iterations: opts.iterations,
    results: cycles.map((row) => ({
      cycle: row.cycle,
      decision: row.decision?.status || null,
      code: row.decision?.code || null,
      token: row.intent?.to || null,
      executed: Boolean(row.action?.executed),
      txHash: row.action?.txHash || null,
      decisionFile: row.files?.decisionFile || null
    })),
    files: {
      decisionLogFile: DECISION_LOG_FILE,
      agentScoreboardMarkdown: board.markdownFile,
      agentScoreboardJson: board.jsonFile
    }
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
