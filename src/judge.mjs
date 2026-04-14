#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SUBMISSION_DIR = path.join(ROOT, "submission");
fs.mkdirSync(SUBMISSION_DIR, { recursive: true });

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function isYes(value) {
  return String(value || "").toLowerCase() === "yes";
}

function extractJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const jsonText = start >= 0 && end >= start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function runCli(command, args) {
  const proc = spawnSync("node", ["src/cli.mjs", command, ...args], {
    encoding: "utf8",
    stdio: "pipe"
  });
  const output = `${proc.stdout || ""}${proc.stderr || ""}`.trim();
  const parsed = extractJson(output);

  if (proc.status !== 0) {
    const errorMessage = parsed?.error || output || `Command failed: ${command}`;
    throw new Error(errorMessage);
  }

  if (!parsed || !parsed.ok) {
    throw new Error(`Unexpected response for ${command}: ${output}`);
  }
  return parsed;
}

function formatMaybeNumber(value, digits = 6) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "n/a";
  return numeric.toFixed(digits);
}

function buildJudgeMarkdown(payload) {
  const {
    projectName,
    runAt,
    mode,
    request,
    selected,
    route,
    phasecFile,
    proofboardFile,
    proofboard,
    txHash,
    verdict,
    notionalUsd
  } = payload;

  const totals = proofboard?.totals || {};
  const recentExecutions = Array.isArray(proofboard?.recentExecutions)
    ? proofboard.recentExecutions
    : [];

  const lines = [
    `# ${projectName} Judge Run`,
    "",
    `Generated: ${runAt}`,
    `Mode: ${mode}`,
    "",
    "## Request",
    `- Chain: ${request.chain}`,
    `- From token: ${request.from}`,
    `- Amount: ${request.amount}`,
    `- Wallet: ${request.wallet}`,
    `- Selected token: ${selected.symbol || "n/a"} (${selected.tokenAddress || "n/a"})`,
    `- Selection strategy: ${selected.strategy || "n/a"}`,
    "",
    "## Route Quality",
    `- Round-trip ratio: ${formatMaybeNumber(route.ratio, 6)}`,
    `- Round-trip loss (%): ${formatMaybeNumber(route.lossPercent, 4)}`,
    `- Candidate scout score: ${selected.score ?? "n/a"}`,
    `- Candidate scout verdict: ${selected.verdict || "n/a"}`,
    "",
    "## Outcome",
    `- Tx hash: ${txHash || "dry-run (no tx)"}`,
    `- Audit verdict: ${verdict}`,
    `- Notional USD: ${formatMaybeNumber(notionalUsd, 6)}`,
    "",
    "## Aggregate Proofboard",
    `- Execute reports: ${totals.executeReports ?? "n/a"}`,
    `- Audit reports: ${totals.auditReports ?? "n/a"}`,
    `- Pass rate (%): ${formatMaybeNumber(totals.passRatePercent, 2)}`,
    `- Avg execution ratio: ${formatMaybeNumber(totals.avgExecutionRatio, 6)}`,
    `- Total tested notional USD: ${formatMaybeNumber(totals.totalNotionalUsd, 6)}`,
    "",
    "## Evidence Files",
    `- Phase C report: ${phasecFile}`,
    `- Proofboard report: ${proofboardFile}`,
    `- Scoreboard: ${proofboard?.scoreboardMarkdownFile || "n/a"}`,
    "",
    "## Recent Executions",
    "| Time (UTC) | Chain | Pair | Notional USD | Tx Hash |",
    "|---|---|---|---:|---|"
  ];

  if (!recentExecutions.length) {
    lines.push("| - | - | - | - | - |");
  } else {
    for (const row of recentExecutions.slice(0, 5)) {
      const pair = `${row.from || "?"} -> ${row.to || "?"}`;
      lines.push(
        `| ${row.createdAt || "-"} | ${row.chain || "-"} | ${pair} | ${formatMaybeNumber(row.notionalUsd, 6)} | ${row.txHash || "-"} |`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const projectName = String(opts.name || "RouteSentinel");
  const chain = String(opts.chain || "xlayer");
  const from = String(
    opts.from || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  );
  const amount = String(opts.amount || "0.0025");
  const wallet = String(opts.wallet || "").trim();
  const maxCandidates = String(opts["max-candidates"] || "6");
  const qualityCandidates = String(opts["quality-candidates"] || "4");
  const tokenOverride = String(opts.to || "").trim();

  if (!wallet) {
    throw new Error("Missing required option --wallet");
  }

  const phasecArgs = [
    "--from",
    from,
    "--amount",
    amount,
    "--chain",
    chain,
    "--wallet",
    wallet,
    "--max-candidates",
    maxCandidates,
    "--quality-candidates",
    qualityCandidates
  ];

  if (tokenOverride) {
    phasecArgs.push("--to", tokenOverride);
  }
  if (opts.include) {
    phasecArgs.push("--include", String(opts.include));
  }
  if (isYes(opts["confirm-live"])) {
    phasecArgs.push("--confirm-live", "yes");
  }

  const phasec = runCli("phasec", phasecArgs);
  const proofboard = runCli("proofboard", []);

  const phasecReport = phasec.report || {};
  const proofboardReport = proofboard.report || {};

  const runAt = new Date().toISOString();
  const stamp = runAt.replaceAll(":", "-");
  const judgeFile = path.join(SUBMISSION_DIR, `${stamp}-judge-run.md`);

  const markdown = buildJudgeMarkdown({
    projectName,
    runAt,
    mode: phasecReport.mode || "unknown",
    request: {
      chain,
      from,
      amount,
      wallet
    },
    selected: {
      tokenAddress: phasecReport.request?.to || null,
      symbol: phasecReport.selectedCandidate?.symbol || null,
      score: phasecReport.selectedCandidate?.recommendation?.score ?? null,
      verdict: phasecReport.selectedCandidate?.recommendation?.verdict || null,
      strategy: phasecReport.selection?.selectedBy || "scout"
    },
    route: {
      ratio: phasecReport.selection?.selectedRouteCheck?.quality?.roundTrip?.ratio ?? null,
      lossPercent:
        phasecReport.selection?.selectedRouteCheck?.quality?.roundTrip?.lossPercent ?? null
    },
    phasecFile: phasec.file,
    proofboardFile: proofboard.file,
    proofboard: proofboardReport,
    txHash: phasecReport.phaseb?.txHash || null,
    verdict: phasecReport.phaseb?.auditVerdict || "dry_run",
    notionalUsd: phasecReport.phaseb?.notionalUsd || null
  });

  fs.writeFileSync(judgeFile, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        summary: {
          mode: phasecReport.mode || "unknown",
          txHash: phasecReport.phaseb?.txHash || null,
          auditVerdict: phasecReport.phaseb?.auditVerdict || "dry_run",
          notionalUsd: phasecReport.phaseb?.notionalUsd || null,
          selectedToken: phasecReport.request?.to || null,
          selectedSymbol: phasecReport.selectedCandidate?.symbol || null,
          selectedBy: phasecReport.selection?.selectedBy || "scout",
          roundTripRatio:
            phasecReport.selection?.selectedRouteCheck?.quality?.roundTrip?.ratio ?? null,
          roundTripLossPercent:
            phasecReport.selection?.selectedRouteCheck?.quality?.roundTrip?.lossPercent ?? null
        },
        files: {
          judgeFile,
          phasecFile: phasec.file,
          proofboardFile: proofboard.file,
          scoreboardFile: proofboardReport?.scoreboardMarkdownFile || null
        }
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
