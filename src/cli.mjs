#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ONCHAINOS_BIN = process.env.ONCHAINOS_BIN || "onchainos";
const MAX_TEST_USD = Number(process.env.MAX_TEST_USD || "0.30");
const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "proof", "reports");
fs.mkdirSync(REPORT_DIR, { recursive: true });

const USAGE = `
RouteSentinel CLI

Commands:
  plan      --from <addr> --to <addr> --amount <ui_amount> --chain <chain> [--wallet <addr>]
  simulate  --from <addr> --to <addr> --amount <ui_amount> --chain <chain>
  execute   --from <addr> --to <addr> --amount <ui_amount> --chain <chain> --wallet <addr>
  audit     [--file <report_file>]   # defaults to latest execute report

Examples:
  npm run simulate -- --from 0xeeee... --to 0x74b7... --amount 0.0025 --chain xlayer
  npm run execute -- --from 0xeeee... --to 0x74b7... --amount 0.0025 --chain xlayer --wallet 0xabc...
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

function requireFields(opts, fields) {
  for (const field of fields) {
    if (!opts[field]) {
      throw new Error(`Missing required option --${field}`);
    }
  }
}

function runJson(args) {
  const proc = spawnSync(ONCHAINOS_BIN, args, { encoding: "utf8" });
  const stdout = proc.stdout || "";
  const stderr = proc.stderr || "";
  const raw = `${stdout}${stderr}`.trim();

  if (proc.error) {
    throw new Error(`Failed to run ${ONCHAINOS_BIN}: ${proc.error.message}`);
  }
  if (!raw) {
    throw new Error(`Empty response from command: ${ONCHAINOS_BIN} ${args.join(" ")}`);
  }

  // Some CLIs emit extra log lines around JSON; extract the outermost JSON block.
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  const jsonText =
    jsonStart >= 0 && jsonEnd >= jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Non-JSON response from command: ${raw}`);
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || `Command failed: ${ONCHAINOS_BIN} ${args.join(" ")}`);
  }
  return parsed.data;
}

function toChainIndex(chain) {
  const value = String(chain).toLowerCase();
  const map = {
    ethereum: "1",
    bsc: "56",
    polygon: "137",
    arbitrum: "42161",
    base: "8453",
    xlayer: "196",
    okb: "196",
    solana: "501",
    sui: "784"
  };
  return map[value] || value;
}

function isNativeAddress(tokenAddress) {
  const value = String(tokenAddress || "").toLowerCase();
  return value === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

function computeNotionalUsd(quote) {
  const decimals = Number(quote.fromToken?.decimal || 0);
  const amountRaw = Number(quote.fromTokenAmount || 0);
  const unitPrice = Number(quote.fromToken?.tokenUnitPrice || 0);
  if (!Number.isFinite(decimals) || !Number.isFinite(amountRaw) || !Number.isFinite(unitPrice)) {
    return 0;
  }
  const uiAmount = amountRaw / 10 ** decimals;
  return uiAmount * unitPrice;
}

function writeReport(kind, payload) {
  const ts = new Date().toISOString().replaceAll(":", "-");
  const file = path.join(REPORT_DIR, `${ts}-${kind}.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

function runTokenScan(chain, toToken) {
  if (isNativeAddress(toToken)) return null;
  const chainIndex = toChainIndex(chain);
  const scan = runJson(["security", "token-scan", "--tokens", `${chainIndex}:${toToken}`]);
  const item = Array.isArray(scan) ? scan[0] : null;
  if (!item) return null;

  // Hard-stop only on critical patterns for micro-test mode.
  if (item.isHoneypot || item.isRiskToken || item.isRubbishAirdrop) {
    throw new Error("Token scan blocked execution: critical token risk detected.");
  }
  return item;
}

function getQuote(opts) {
  const data = runJson([
    "swap",
    "quote",
    "--from",
    opts.from,
    "--to",
    opts.to,
    "--readable-amount",
    String(opts.amount),
    "--chain",
    opts.chain
  ]);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No quote route returned.");
  }
  return data[0];
}

function buildPlan(opts) {
  return {
    command: "plan",
    createdAt: new Date().toISOString(),
    guardrails: {
      maxTestUsd: MAX_TEST_USD,
      source: "MAX_TEST_USD env var"
    },
    request: {
      from: opts.from,
      to: opts.to,
      amount: String(opts.amount),
      chain: opts.chain,
      wallet: opts.wallet || null
    }
  };
}

function simulate(opts) {
  requireFields(opts, ["from", "to", "amount", "chain"]);

  const scan = runTokenScan(opts.chain, opts.to);
  const quote = getQuote(opts);
  const notionalUsd = computeNotionalUsd(quote);
  const passCap = notionalUsd <= MAX_TEST_USD;

  const report = {
    command: "simulate",
    createdAt: new Date().toISOString(),
    request: {
      from: opts.from,
      to: opts.to,
      amount: String(opts.amount),
      chain: opts.chain
    },
    guardrails: {
      maxTestUsd: MAX_TEST_USD,
      notionalUsd,
      passCap
    },
    tokenScan: scan,
    quote
  };

  const file = writeReport("simulate", report);
  if (!passCap) {
    throw new Error(`Simulation blocked: notional $${notionalUsd.toFixed(6)} exceeds cap $${MAX_TEST_USD.toFixed(2)}.`);
  }
  return { report, file };
}

function execute(opts) {
  requireFields(opts, ["from", "to", "amount", "chain", "wallet"]);

  const sim = simulate(opts);
  const execData = runJson([
    "swap",
    "execute",
    "--from",
    opts.from,
    "--to",
    opts.to,
    "--readable-amount",
    String(opts.amount),
    "--chain",
    opts.chain,
    "--wallet",
    opts.wallet
  ]);

  const report = {
    command: "execute",
    createdAt: new Date().toISOString(),
    request: {
      from: opts.from,
      to: opts.to,
      amount: String(opts.amount),
      chain: opts.chain,
      wallet: opts.wallet
    },
    guardrails: sim.report.guardrails,
    simulationReportFile: sim.file,
    quoteSnapshot: sim.report.quote,
    tokenScanSnapshot: sim.report.tokenScan,
    execution: execData
  };
  const file = writeReport("execute", report);
  return { report, file };
}

function latestExecuteReport() {
  const files = fs
    .readdirSync(REPORT_DIR)
    .filter((name) => name.endsWith("-execute.json"))
    .sort();
  if (!files.length) throw new Error("No execute report found.");
  return path.join(REPORT_DIR, files[files.length - 1]);
}

function audit(opts) {
  const reportFile = opts.file ? path.resolve(opts.file) : latestExecuteReport();
  const raw = fs.readFileSync(reportFile, "utf8");
  const parsed = JSON.parse(raw);

  const execution = parsed.execution || {};
  const quote = parsed.quoteSnapshot || {};

  const expectedToRaw = Number(quote.toTokenAmount || 0);
  const actualToRaw = Number(execution.toAmount || 0);
  const toDecimals = Number(execution.toToken?.decimal || quote.toToken?.decimal || 0);
  const expectedToUi = toDecimals ? expectedToRaw / 10 ** toDecimals : 0;
  const actualToUi = toDecimals ? actualToRaw / 10 ** toDecimals : 0;
  const executionRatio =
    expectedToRaw > 0 && actualToRaw > 0 ? actualToRaw / expectedToRaw : null;

  let verdict = "insufficient_data";
  if (executionRatio !== null) {
    if (executionRatio >= 0.995) verdict = "excellent";
    else if (executionRatio >= 0.99) verdict = "good";
    else if (executionRatio >= 0.97) verdict = "acceptable";
    else verdict = "needs_review";
  }

  const summary = {
    auditedAt: new Date().toISOString(),
    reportFile,
    txHash: execution.swapTxHash || null,
    fromSymbol: execution.fromToken?.tokenSymbol || null,
    toSymbol: execution.toToken?.tokenSymbol || null,
    fromAmountRaw: execution.fromAmount || null,
    toAmountRaw: execution.toAmount || null,
    priceImpact: execution.priceImpact || null,
    gasUsed: execution.gasUsed || null,
    capUsd: parsed.guardrails?.maxTestUsd || MAX_TEST_USD,
    notionalUsd: parsed.guardrails?.notionalUsd || null,
    expectedToRaw: quote.toTokenAmount || null,
    actualToRaw: execution.toAmount || null,
    expectedToUi,
    actualToUi,
    executionRatio,
    verdict
  };
  const file = writeReport("audit", summary);
  return { report: summary, file };
}

function main() {
  const command = process.argv[2];
  const options = parseArgs(process.argv.slice(3));

  if (!command || ["-h", "--help", "help"].includes(command)) {
    console.log(USAGE.trim());
    process.exit(0);
  }

  let result;
  if (command === "plan") {
    requireFields(options, ["from", "to", "amount", "chain"]);
    const report = buildPlan(options);
    const file = writeReport("plan", report);
    result = { report, file };
  } else if (command === "simulate") {
    result = simulate(options);
  } else if (command === "execute") {
    result = execute(options);
  } else if (command === "audit") {
    result = audit(options);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
