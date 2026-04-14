#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ONCHAINOS_BIN = process.env.ONCHAINOS_BIN || "onchainos";
const MAX_TEST_USD = Number(process.env.MAX_TEST_USD || "0.30");
const ONCHAINOS_MAX_BUFFER = Number(process.env.ONCHAINOS_MAX_BUFFER || 25 * 1024 * 1024);
const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "proof", "reports");
fs.mkdirSync(REPORT_DIR, { recursive: true });

const USAGE = `
RouteSentinel CLI

Commands:
  plan       --from <addr> --to <addr> --amount <ui_amount> --chain <chain> [--wallet <addr>]
  simulate   --from <addr> --to <addr> --amount <ui_amount> --chain <chain>
  execute    --from <addr> --to <addr> --amount <ui_amount> --chain <chain> --wallet <addr> [--skip-tx-scan yes]
  audit      [--file <report_file>]   # defaults to latest execute report
  intel      --to <addr> --chain <chain>
  scout      --chain <chain> [--max-candidates <n>] [--min-signal-amount-usd <usd>] [--time-frame <1..5>] [--sort-by <1..5>] [--include <0xaddr,...>]
  proofboard # aggregate execute/audit reports into a scoreboard
  phaseb     --from <addr> --to <addr> --amount <ui_amount> --chain <chain> --wallet <addr> --confirm-live yes [--force-intel yes]
  phasec     --from <addr> --amount <ui_amount> --chain <chain> --wallet <addr> [--max-candidates <n>] [--to <addr>] [--confirm-live yes]

Examples:
  npm run simulate -- --from 0xeeee... --to 0x74b7... --amount 0.0025 --chain xlayer
  npm run execute -- --from 0xeeee... --to 0x74b7... --amount 0.0025 --chain xlayer --wallet 0xabc...
  npm run intel -- --to 0x74b7... --chain xlayer
  npm run scout -- --chain xlayer --max-candidates 10
  npm run phaseb -- --from 0xeeee... --to 0x74b7... --amount 0.0025 --chain xlayer --wallet 0xabc... --confirm-live yes
  npm run phasec -- --from 0xeeee... --amount 0.0025 --chain xlayer --wallet 0xabc...
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

function isYes(value) {
  return String(value || "").toLowerCase() === "yes";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstItem(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function formatUsd(value) {
  return Number.isFinite(value) ? Number(value).toFixed(6) : "n/a";
}

function average(values) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTokenAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw.startsWith("0x") || raw.length !== 42) return null;
  return raw;
}

function runJson(args) {
  const proc = spawnSync(ONCHAINOS_BIN, args, {
    encoding: "utf8",
    maxBuffer: ONCHAINOS_MAX_BUFFER
  });
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

function safeDataCall(label, fn) {
  try {
    return { label, ok: true, data: fn(), error: null };
  } catch (error) {
    return { label, ok: false, data: null, error: error.message };
  }
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

function fetchTokenScan(chain, tokenAddress) {
  if (isNativeAddress(tokenAddress)) return null;
  const chainIndex = toChainIndex(chain);
  const scan = runJson(["security", "token-scan", "--tokens", `${chainIndex}:${tokenAddress}`]);
  return Array.isArray(scan) ? scan[0] || null : null;
}

function hasCriticalTokenRisk(item) {
  return Boolean(item && (item.isHoneypot || item.isRiskToken || item.isRubbishAirdrop));
}

function runTokenScan(chain, tokenAddress) {
  const item = fetchTokenScan(chain, tokenAddress);
  if (hasCriticalTokenRisk(item)) {
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

function getSwapPreview(opts) {
  const data = runJson([
    "swap",
    "swap",
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
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No swap preview route returned.");
  }
  return data[0];
}

function compactSwapPreview(preview) {
  const tx = preview?.tx || {};
  const routerResult = preview?.routerResult || {};
  return {
    router: routerResult.router || null,
    fromAmountRaw: routerResult.fromTokenAmount || null,
    toAmountRaw: routerResult.toTokenAmount || null,
    priceImpactPercent: routerResult.priceImpactPercent || null,
    tradeFee: routerResult.tradeFee || null,
    minReceiveAmount: tx.minReceiveAmount || null,
    gas: tx.gas || null,
    gasPrice: tx.gasPrice || null,
    to: tx.to || null,
    value: tx.value || null,
    calldataBytes: tx.data ? Math.floor(String(tx.data).length / 2) : null
  };
}

function runTxScan(chain, preview) {
  const tx = preview?.tx || null;
  if (!tx?.from || !tx?.to || !tx?.data) {
    return {
      skipped: true,
      reason: "missing_tx_fields",
      result: null,
      error: null
    };
  }

  const args = [
    "security",
    "tx-scan",
    "--from",
    tx.from,
    "--to",
    tx.to,
    "--chain",
    chain,
    "--data",
    tx.data
  ];

  if (tx.value && tx.value !== "0") {
    args.push("--value", String(tx.value));
  }
  if (tx.gas) {
    args.push("--gas", String(tx.gas));
  }
  if (tx.gasPrice) {
    args.push("--gas-price", String(tx.gasPrice));
  }

  try {
    return {
      skipped: false,
      reason: null,
      result: runJson(args),
      error: null
    };
  } catch (error) {
    return {
      skipped: false,
      reason: null,
      result: null,
      error: error.message
    };
  }
}

function assessTxScan(txScan) {
  if (!txScan) {
    return {
      blocked: false,
      reason: "missing_scan",
      riskCount: 0,
      warningCount: 0,
      warnings: [],
      revertReason: null
    };
  }

  if (txScan.skipped) {
    return {
      blocked: false,
      reason: txScan.reason || "scan_skipped",
      riskCount: 0,
      warningCount: 0,
      warnings: [],
      revertReason: null
    };
  }

  if (txScan.error) {
    return {
      blocked: false,
      reason: "scan_error",
      riskCount: 0,
      warningCount: 1,
      warnings: [txScan.error],
      revertReason: null
    };
  }

  const scanResult = txScan.result || {};
  const riskItems = toArray(scanResult.riskItemDetail);
  const rawWarnings = scanResult.warnings;
  const warnings = Array.isArray(rawWarnings)
    ? rawWarnings
    : rawWarnings
      ? [String(rawWarnings)]
      : [];
  const revertReason = scanResult.simulator?.revertReason || null;

  const criticalPattern = /critical|high|danger|malicious|scam|phish|drain|rug|blacklist|stolen|honey/i;
  const hasCriticalRisk = riskItems.some((item) => criticalPattern.test(JSON.stringify(item)));

  return {
    blocked: hasCriticalRisk,
    reason: hasCriticalRisk ? "critical_risk_item_detected" : "ok",
    riskCount: riskItems.length,
    warningCount: warnings.length,
    warnings,
    revertReason
  };
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
    throw new Error(
      `Simulation blocked: notional $${notionalUsd.toFixed(6)} exceeds cap $${MAX_TEST_USD.toFixed(2)}.`
    );
  }
  return { report, file };
}

function execute(opts) {
  requireFields(opts, ["from", "to", "amount", "chain", "wallet"]);

  const sim = simulate(opts);
  const skipTxScan = isYes(opts["skip-tx-scan"]);

  let previewSummary = null;
  let txScan = {
    skipped: true,
    reason: "skip_tx_scan_requested",
    result: null,
    error: null
  };
  let txScanGuard = assessTxScan(txScan);

  if (!skipTxScan) {
    const swapPreview = getSwapPreview(opts);
    previewSummary = compactSwapPreview(swapPreview);
    txScan = runTxScan(opts.chain, swapPreview);
    txScanGuard = assessTxScan(txScan);

    if (txScanGuard.blocked) {
      throw new Error("Execution blocked: tx-scan reported critical risk.");
    }
  }

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
    txPreview: previewSummary,
    txScan,
    txScanGuard,
    execution: execData
  };
  const file = writeReport("execute", report);
  return { report, file };
}

function summarizeSignalRows(rows) {
  const sample = rows.slice(0, 10).map((row) => ({
    timestamp: row.timestamp || null,
    walletType: row.walletType || null,
    amountUsd: toNumber(row.amountUsd),
    triggerWalletCount: toNumber(row.triggerWalletCount),
    soldRatioPercent: toNumber(row.soldRatioPercent),
    token: {
      tokenAddress: row.token?.tokenAddress || null,
      symbol: row.token?.symbol || null,
      marketCapUsd: toNumber(row.token?.marketCapUsd),
      top10HolderPercent: toNumber(row.token?.top10HolderPercent)
    }
  }));

  return {
    count: rows.length,
    sample
  };
}

function summarizeLeaderboardMentions(rows, tokenAddress) {
  const target = String(tokenAddress || "").toLowerCase();
  const mentions = [];

  for (const row of rows) {
    const topTokens = toArray(row.topPnlTokenList);
    for (const token of topTokens) {
      if (String(token.tokenContractAddress || "").toLowerCase() !== target) continue;
      mentions.push({
        walletAddress: row.walletAddress || null,
        tokenSymbol: token.tokenSymbol || null,
        tokenPnlUsd: toNumber(token.tokenPnLUsd),
        tokenPnlPercent: toNumber(token.tokenPnLPercent),
        walletRealizedPnlUsd: toNumber(row.realizedPnlUsd),
        walletWinRatePercent: toNumber(row.winRatePercent),
        walletTxs: toNumber(row.txs),
        lastActiveTimestamp: row.lastActiveTimestamp || null
      });
      break;
    }
  }

  const pnlValues = mentions
    .map((item) => item.tokenPnlUsd)
    .filter((value) => value !== null);
  const winRateValues = mentions
    .map((item) => item.walletWinRatePercent)
    .filter((value) => value !== null);

  mentions.sort((a, b) => (b.tokenPnlUsd || 0) - (a.tokenPnlUsd || 0));

  return {
    scannedRows: rows.length,
    mentions: mentions.length,
    avgTokenPnlUsd: average(pnlValues),
    avgWalletWinRatePercent: average(winRateValues),
    topMentions: mentions.slice(0, 10)
  };
}

function summarizeTrackerMentions(trades, tokenAddress) {
  const target = String(tokenAddress || "").toLowerCase();
  const mentions = trades.filter(
    (trade) => String(trade.tokenContractAddress || "").toLowerCase() === target
  );

  let buys = 0;
  let sells = 0;
  let netRealizedPnlUsd = 0;
  let totalQuoteTokenAmount = 0;

  for (const trade of mentions) {
    const tradeType = String(trade.tradeType || "");
    if (tradeType === "1") buys += 1;
    else if (tradeType === "2") sells += 1;

    const realized = toNumber(trade.realizedPnlUsd);
    if (realized !== null) netRealizedPnlUsd += realized;

    const quoteAmount = toNumber(trade.quoteTokenAmount);
    if (quoteAmount !== null) totalQuoteTokenAmount += quoteAmount;
  }

  const recent = mentions.slice(0, 10).map((trade) => ({
    tradeTime: trade.tradeTime || null,
    tradeType: trade.tradeType || null,
    walletAddress: trade.walletAddress || null,
    quoteTokenAmount: toNumber(trade.quoteTokenAmount),
    quoteTokenSymbol: trade.quoteTokenSymbol || null,
    realizedPnlUsd: toNumber(trade.realizedPnlUsd),
    txHash: trade.txHash || null
  }));

  let bias = "neutral";
  if (buys > sells) bias = "buy";
  else if (sells > buys) bias = "sell";

  return {
    scannedTrades: trades.length,
    mentions: mentions.length,
    buyCount: buys,
    sellCount: sells,
    buySellBias: bias,
    netRealizedPnlUsd,
    totalQuoteTokenAmount,
    recent
  };
}

function summarizeTokenSignals(rows, tokenAddress) {
  const target = String(tokenAddress || "").toLowerCase();
  const matches = rows.filter(
    (row) => String(row.token?.tokenAddress || "").toLowerCase() === target
  );

  const amounts = matches
    .map((row) => toNumber(row.amountUsd))
    .filter((value) => value !== null);
  const triggerWallets = matches
    .map((row) => toNumber(row.triggerWalletCount))
    .filter((value) => value !== null);

  return {
    count: matches.length,
    avgAmountUsd: average(amounts),
    maxAmountUsd: amounts.length ? Math.max(...amounts) : null,
    avgTriggerWalletCount: average(triggerWallets)
  };
}

function buildIntelScore({ tokenScan, tokenPrice, tokenAdvanced, signalSummary, leaderboardSummary, trackerSummary }) {
  let score = 50;
  const reasons = [];
  const criticalTokenRisk = hasCriticalTokenRisk(tokenScan);

  if (criticalTokenRisk) {
    score -= 70;
    reasons.push("Critical token risk was detected by token scan.");
  } else if (tokenScan) {
    score += 5;
    reasons.push("Token scan did not flag critical risk.");
  }

  const riskControlLevel = toNumber(tokenAdvanced?.riskControlLevel);
  if (riskControlLevel !== null) {
    if (riskControlLevel <= 1) {
      score += 10;
      reasons.push("Risk control level is low.");
    } else if (riskControlLevel === 2) {
      score += 4;
      reasons.push("Risk control level is moderate.");
    } else {
      score -= 18;
      reasons.push("Risk control level is elevated.");
    }
  }

  const liquidity = toNumber(tokenPrice?.liquidity);
  if (liquidity !== null) {
    if (liquidity >= 1_000_000) {
      score += 12;
      reasons.push("Liquidity is strong.");
    } else if (liquidity >= 250_000) {
      score += 8;
      reasons.push("Liquidity is healthy.");
    } else if (liquidity >= 100_000) {
      score += 4;
    } else if (liquidity < 25_000) {
      score -= 12;
      reasons.push("Liquidity is thin.");
    }
  }

  const marketCap = toNumber(tokenPrice?.marketCap);
  if (marketCap !== null) {
    if (marketCap >= 1_000_000) score += 6;
    else if (marketCap < 50_000) {
      score -= 8;
      reasons.push("Market cap is very small.");
    }
  }

  const top10HolderPercent = toNumber(tokenAdvanced?.top10HoldPercent);
  if (top10HolderPercent !== null) {
    if (top10HolderPercent <= 25) {
      score += 6;
      reasons.push("Top-10 holder concentration is low.");
    } else if (top10HolderPercent <= 40) {
      score += 2;
    } else if (top10HolderPercent > 60) {
      score -= 10;
      reasons.push("Top-10 holder concentration is high.");
    }
  }

  const priceChange24H = toNumber(tokenPrice?.priceChange24H);
  if (priceChange24H !== null) {
    const absMove = Math.abs(priceChange24H);
    if (absMove <= 10) score += 4;
    else if (absMove > 40) {
      score -= 8;
      reasons.push("24h price move is highly volatile.");
    } else if (absMove > 25) {
      score -= 4;
    }
  }

  if (signalSummary.count > 0) {
    const signalBoost = Math.min(12, signalSummary.count * 1.5);
    score += signalBoost;
    reasons.push(`Smart-money signal count boost (+${signalBoost.toFixed(1)}).`);
  }

  if (leaderboardSummary.mentions > 0) {
    const leaderboardBoost = Math.min(15, leaderboardSummary.mentions * 2);
    score += leaderboardBoost;
    reasons.push(`Leaderboard token mentions boost (+${leaderboardBoost.toFixed(1)}).`);

    const avgWinRate = leaderboardSummary.avgWalletWinRatePercent;
    if (avgWinRate !== null && avgWinRate >= 60) {
      score += 5;
      reasons.push("Mentioning wallets show high win rate.");
    } else if (avgWinRate !== null && avgWinRate < 40) {
      score -= 4;
      reasons.push("Mentioning wallets show weak win rate.");
    }
  }

  if (trackerSummary.mentions > 0) {
    if (trackerSummary.buyCount > trackerSummary.sellCount) {
      score += 6;
      reasons.push("Tracker bias is net buy.");
    } else if (trackerSummary.sellCount > trackerSummary.buyCount) {
      score -= 5;
      reasons.push("Tracker bias is net sell.");
    }

    if (trackerSummary.netRealizedPnlUsd > 0) score += 4;
    else if (trackerSummary.netRealizedPnlUsd < 0) score -= 4;
  }

  score = clamp(Math.round(score * 100) / 100, 0, 100);

  let verdict = "avoid";
  if (score >= 75) verdict = "go";
  else if (score >= 60) verdict = "caution";

  return {
    score,
    verdict,
    criticalTokenRisk,
    reasons,
    allowLiveTest: verdict !== "avoid" && !criticalTokenRisk
  };
}

function intel(opts) {
  requireFields(opts, ["to", "chain"]);

  if (isNativeAddress(opts.to)) {
    const report = {
      command: "intel",
      createdAt: new Date().toISOString(),
      request: {
        to: opts.to,
        chain: opts.chain
      },
      skipped: true,
      reason: "Destination token is native gas token; token intelligence scan skipped.",
      recommendation: {
        allowLiveTest: true,
        verdict: "go",
        score: 70,
        reasons: ["Native token destination has no ERC-20 token contract risk surface."]
      }
    };
    const file = writeReport("intel", report);
    return { report, file };
  }

  const tokenScanCall = safeDataCall("tokenScan", () => fetchTokenScan(opts.chain, opts.to));
  const priceInfoCall = safeDataCall("priceInfo", () => {
    const data = runJson(["token", "price-info", "--chain", opts.chain, "--address", opts.to]);
    return firstItem(data);
  });
  const advancedInfoCall = safeDataCall("advancedInfo", () =>
    runJson(["token", "advanced-info", "--chain", opts.chain, "--address", opts.to])
  );
  const signalCall = safeDataCall("signal", () =>
    toArray(runJson(["signal", "list", "--chain", opts.chain, "--token-address", opts.to]))
  );
  const leaderboardCall = safeDataCall("leaderboard", () =>
    toArray(
      runJson([
        "leaderboard",
        "list",
        "--chain",
        opts.chain,
        "--time-frame",
        "3",
        "--sort-by",
        "5"
      ])
    )
  );
  const trackerCall = safeDataCall("tracker", () => {
    const data = runJson(["tracker", "activities", "--tracker-type", "smart_money", "--chain", opts.chain]);
    return toArray(data?.trades);
  });

  const signalRows = signalCall.ok ? signalCall.data : [];
  const leaderboardRows = leaderboardCall.ok ? leaderboardCall.data : [];
  const trackerTrades = trackerCall.ok ? trackerCall.data : [];

  const signalSummary = summarizeSignalRows(signalRows);
  const leaderboardSummary = summarizeLeaderboardMentions(leaderboardRows, opts.to);
  const trackerSummary = summarizeTrackerMentions(trackerTrades, opts.to);

  const score = buildIntelScore({
    tokenScan: tokenScanCall.data,
    tokenPrice: priceInfoCall.data,
    tokenAdvanced: advancedInfoCall.data,
    signalSummary,
    leaderboardSummary,
    trackerSummary
  });

  const report = {
    command: "intel",
    createdAt: new Date().toISOString(),
    request: {
      to: opts.to,
      chain: opts.chain
    },
    upstream: {
      tokenScan: { ok: tokenScanCall.ok, error: tokenScanCall.error },
      priceInfo: { ok: priceInfoCall.ok, error: priceInfoCall.error },
      advancedInfo: { ok: advancedInfoCall.ok, error: advancedInfoCall.error },
      signal: { ok: signalCall.ok, error: signalCall.error },
      leaderboard: { ok: leaderboardCall.ok, error: leaderboardCall.error },
      tracker: { ok: trackerCall.ok, error: trackerCall.error }
    },
    tokenScan: tokenScanCall.data,
    tokenPriceInfo: priceInfoCall.data,
    tokenAdvancedInfo: advancedInfoCall.data,
    signalSummary,
    leaderboardSummary,
    trackerSummary,
    recommendation: {
      allowLiveTest: score.allowLiveTest,
      verdict: score.verdict,
      score: score.score,
      criticalTokenRisk: score.criticalTokenRisk,
      reasons: score.reasons
    }
  };

  const file = writeReport("intel", report);
  return { report, file };
}

function buildScoutUniverse({ signalRows, leaderboardRows, trackerTrades, includeTokens }) {
  const universe = new Map();

  function touchCandidate(address, source, symbol) {
    const tokenAddress = normalizeTokenAddress(address);
    if (!tokenAddress || isNativeAddress(tokenAddress)) return null;

    if (!universe.has(tokenAddress)) {
      universe.set(tokenAddress, {
        tokenAddress,
        symbol: symbol || null,
        sources: new Set(),
        signalCount: 0,
        leaderboardMentions: 0,
        trackerMentions: 0,
        manualPinned: false
      });
    }

    const entry = universe.get(tokenAddress);
    entry.sources.add(source);
    if (!entry.symbol && symbol) entry.symbol = symbol;
    return entry;
  }

  for (const row of signalRows) {
    const entry = touchCandidate(row.token?.tokenAddress, "signal", row.token?.symbol || null);
    if (!entry) continue;
    entry.signalCount += 1;
  }

  for (const row of leaderboardRows) {
    for (const token of toArray(row.topPnlTokenList)) {
      const entry = touchCandidate(token.tokenContractAddress, "leaderboard", token.tokenSymbol || null);
      if (!entry) continue;
      entry.leaderboardMentions += 1;
    }
  }

  for (const trade of trackerTrades) {
    const entry = touchCandidate(trade.tokenContractAddress, "tracker", trade.tokenSymbol || null);
    if (!entry) continue;
    entry.trackerMentions += 1;
  }

  for (const tokenAddress of includeTokens) {
    const entry = touchCandidate(tokenAddress, "manual", null);
    if (!entry) continue;
    entry.manualPinned = true;
  }

  const candidates = Array.from(universe.values()).map((item) => {
    const activityRawScore =
      item.signalCount * 3 + item.leaderboardMentions * 4 + item.trackerMentions * 2;
    return {
      ...item,
      sources: Array.from(item.sources).sort(),
      activityRawScore
    };
  });

  candidates.sort((a, b) => {
    if (a.manualPinned !== b.manualPinned) return a.manualPinned ? -1 : 1;
    if (b.activityRawScore !== a.activityRawScore) return b.activityRawScore - a.activityRawScore;
    if (b.signalCount !== a.signalCount) return b.signalCount - a.signalCount;
    if (b.leaderboardMentions !== a.leaderboardMentions) return b.leaderboardMentions - a.leaderboardMentions;
    if (b.trackerMentions !== a.trackerMentions) return b.trackerMentions - a.trackerMentions;
    return a.tokenAddress.localeCompare(b.tokenAddress);
  });

  return candidates;
}

function scout(opts) {
  requireFields(opts, ["chain"]);

  const maxCandidates = clamp(Math.trunc(toNumber(opts["max-candidates"]) || 12), 1, 40);
  const timeFrame = String(opts["time-frame"] || "3");
  const sortBy = String(opts["sort-by"] || "5");
  const includeTokens = parseCsv(opts.include)
    .map((value) => normalizeTokenAddress(value))
    .filter(Boolean);

  const signalArgs = ["signal", "list", "--chain", opts.chain];
  if (opts["min-signal-amount-usd"]) {
    signalArgs.push("--min-amount-usd", String(opts["min-signal-amount-usd"]));
  }

  const signalCall = safeDataCall("signal", () => toArray(runJson(signalArgs)));
  const leaderboardCall = safeDataCall("leaderboard", () =>
    toArray(
      runJson([
        "leaderboard",
        "list",
        "--chain",
        opts.chain,
        "--time-frame",
        timeFrame,
        "--sort-by",
        sortBy
      ])
    )
  );
  const trackerCall = safeDataCall("tracker", () => {
    const data = runJson([
      "tracker",
      "activities",
      "--tracker-type",
      "smart_money",
      "--chain",
      opts.chain
    ]);
    return toArray(data?.trades);
  });

  const signalRows = signalCall.ok ? signalCall.data : [];
  const leaderboardRows = leaderboardCall.ok ? leaderboardCall.data : [];
  const trackerTrades = trackerCall.ok ? trackerCall.data : [];

  const universe = buildScoutUniverse({
    signalRows,
    leaderboardRows,
    trackerTrades,
    includeTokens
  });

  const selectedCandidates = universe.slice(0, maxCandidates);
  const ranking = [];

  for (const candidate of selectedCandidates) {
    const tokenScanCall = safeDataCall("tokenScan", () =>
      fetchTokenScan(opts.chain, candidate.tokenAddress)
    );
    const priceInfoCall = safeDataCall("priceInfo", () => {
      const data = runJson([
        "token",
        "price-info",
        "--chain",
        opts.chain,
        "--address",
        candidate.tokenAddress
      ]);
      return firstItem(data);
    });
    const advancedInfoCall = safeDataCall("advancedInfo", () =>
      runJson([
        "token",
        "advanced-info",
        "--chain",
        opts.chain,
        "--address",
        candidate.tokenAddress
      ])
    );

    const signalSummary = summarizeTokenSignals(signalRows, candidate.tokenAddress);
    const leaderboardSummary = summarizeLeaderboardMentions(leaderboardRows, candidate.tokenAddress);
    const trackerSummary = summarizeTrackerMentions(trackerTrades, candidate.tokenAddress);

    const score = buildIntelScore({
      tokenScan: tokenScanCall.data,
      tokenPrice: priceInfoCall.data,
      tokenAdvanced: advancedInfoCall.data,
      signalSummary,
      leaderboardSummary,
      trackerSummary
    });

    ranking.push({
      tokenAddress: candidate.tokenAddress,
      symbol: candidate.symbol,
      sources: candidate.sources,
      activity: {
        rawScore: candidate.activityRawScore,
        signalCount: candidate.signalCount,
        leaderboardMentions: candidate.leaderboardMentions,
        trackerMentions: candidate.trackerMentions,
        manualPinned: candidate.manualPinned
      },
      market: {
        price: toNumber(priceInfoCall.data?.price),
        liquidity: toNumber(priceInfoCall.data?.liquidity),
        marketCap: toNumber(priceInfoCall.data?.marketCap),
        holders: toNumber(priceInfoCall.data?.holders),
        priceChange24H: toNumber(priceInfoCall.data?.priceChange24H)
      },
      risk: {
        riskControlLevel: toNumber(advancedInfoCall.data?.riskControlLevel),
        top10HoldPercent: toNumber(advancedInfoCall.data?.top10HoldPercent),
        criticalTokenRisk: hasCriticalTokenRisk(tokenScanCall.data),
        tokenScan: tokenScanCall.data
          ? {
              isHoneypot: Boolean(tokenScanCall.data.isHoneypot),
              isRiskToken: Boolean(tokenScanCall.data.isRiskToken),
              isRubbishAirdrop: Boolean(tokenScanCall.data.isRubbishAirdrop),
              isLowLiquidity: Boolean(tokenScanCall.data.isLowLiquidity),
              isMintable: Boolean(tokenScanCall.data.isMintable)
            }
          : null
      },
      signalSummary,
      leaderboardSummary: {
        mentions: leaderboardSummary.mentions,
        avgTokenPnlUsd: leaderboardSummary.avgTokenPnlUsd,
        avgWalletWinRatePercent: leaderboardSummary.avgWalletWinRatePercent,
        topWallets: leaderboardSummary.topMentions.slice(0, 3).map((item) => item.walletAddress)
      },
      trackerSummary: {
        mentions: trackerSummary.mentions,
        buyCount: trackerSummary.buyCount,
        sellCount: trackerSummary.sellCount,
        buySellBias: trackerSummary.buySellBias,
        netRealizedPnlUsd: trackerSummary.netRealizedPnlUsd
      },
      recommendation: {
        allowLiveTest: score.allowLiveTest,
        verdict: score.verdict,
        score: score.score,
        criticalTokenRisk: score.criticalTokenRisk,
        reasons: score.reasons
      },
      upstream: {
        tokenScanOk: tokenScanCall.ok,
        priceInfoOk: priceInfoCall.ok,
        advancedInfoOk: advancedInfoCall.ok
      }
    });
  }

  ranking.sort((a, b) => {
    if (a.recommendation.allowLiveTest !== b.recommendation.allowLiveTest) {
      return a.recommendation.allowLiveTest ? -1 : 1;
    }
    if (b.recommendation.score !== a.recommendation.score) {
      return b.recommendation.score - a.recommendation.score;
    }
    return b.activity.rawScore - a.activity.rawScore;
  });

  const nextCandidate =
    ranking.find(
      (item) =>
        item.recommendation.allowLiveTest &&
        item.recommendation.verdict === "go"
    ) ||
    ranking.find((item) => item.recommendation.allowLiveTest) ||
    ranking[0] ||
    null;

  const report = {
    command: "scout",
    createdAt: new Date().toISOString(),
    request: {
      chain: opts.chain,
      maxCandidates,
      timeFrame,
      sortBy,
      minSignalAmountUsd: opts["min-signal-amount-usd"] || null,
      includeTokens
    },
    upstream: {
      signal: { ok: signalCall.ok, error: signalCall.error, rows: signalRows.length },
      leaderboard: {
        ok: leaderboardCall.ok,
        error: leaderboardCall.error,
        rows: leaderboardRows.length
      },
      tracker: { ok: trackerCall.ok, error: trackerCall.error, rows: trackerTrades.length }
    },
    candidateUniverseSize: universe.length,
    ranking,
    nextCandidate
  };

  const file = writeReport("scout", report);
  return { report, file };
}

function listReportFiles(suffix) {
  if (!fs.existsSync(REPORT_DIR)) return [];
  return fs
    .readdirSync(REPORT_DIR)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => path.join(REPORT_DIR, name));
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function proofboard() {
  const executeFiles = listReportFiles("-execute.json");
  const auditFiles = listReportFiles("-audit.json");

  const executes = executeFiles
    .map((file) => ({ file, data: readJsonSafe(file) }))
    .filter((item) => item.data);
  const audits = auditFiles
    .map((file) => ({ file, data: readJsonSafe(file) }))
    .filter((item) => item.data);

  const verdictBreakdown = {};
  const executionRatios = [];
  const notionals = [];

  for (const auditItem of audits) {
    const verdict = auditItem.data.verdict || "unknown";
    verdictBreakdown[verdict] = (verdictBreakdown[verdict] || 0) + 1;

    const ratio = toNumber(auditItem.data.executionRatio);
    if (ratio !== null) executionRatios.push(ratio);
  }

  for (const executeItem of executes) {
    const notional = toNumber(executeItem.data.guardrails?.notionalUsd);
    if (notional !== null) notionals.push(notional);
  }

  const passVerdicts = new Set(["excellent", "good", "acceptable"]);
  const passedAudits = audits.filter((item) => passVerdicts.has(item.data.verdict)).length;

  const recentExecutions = executes
    .slice(-10)
    .reverse()
    .map((item) => ({
      createdAt: item.data.createdAt || null,
      chain: item.data.request?.chain || null,
      from: item.data.request?.from || null,
      to: item.data.request?.to || null,
      notionalUsd: toNumber(item.data.guardrails?.notionalUsd),
      txHash: item.data.execution?.swapTxHash || null,
      reportFile: item.file
    }));

  const scoreboardMarkdownFile = path.join(REPORT_DIR, "scoreboard.md");
  const markdownLines = [
    "# RouteSentinel Proofboard",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    `- Execute reports: ${executes.length}`,
    `- Audit reports: ${audits.length}`,
    `- Passing audits (excellent/good/acceptable): ${passedAudits}`,
    `- Pass rate: ${audits.length ? ((passedAudits / audits.length) * 100).toFixed(2) : "0.00"}%`,
    `- Average execution ratio: ${executionRatios.length ? average(executionRatios).toFixed(6) : "n/a"}`,
    `- Total notional tested (USD): ${notionals.length ? notionals.reduce((sum, value) => sum + value, 0).toFixed(6) : "0.000000"}`,
    `- Max single-test notional (USD): ${notionals.length ? Math.max(...notionals).toFixed(6) : "0.000000"}`,
    "",
    "## Verdict Breakdown"
  ];

  const verdictKeys = Object.keys(verdictBreakdown).sort();
  if (!verdictKeys.length) {
    markdownLines.push("- none");
  } else {
    for (const key of verdictKeys) {
      markdownLines.push(`- ${key}: ${verdictBreakdown[key]}`);
    }
  }

  markdownLines.push("", "## Recent Executions", "| Time (UTC) | Chain | Pair | Notional USD | Tx Hash |", "|---|---|---|---:|---|");

  if (!recentExecutions.length) {
    markdownLines.push("| - | - | - | - | - |");
  } else {
    for (const row of recentExecutions) {
      const pair = `${row.from || "?"} -> ${row.to || "?"}`;
      const txHash = row.txHash || "-";
      markdownLines.push(
        `| ${row.createdAt || "-"} | ${row.chain || "-"} | ${pair} | ${formatUsd(row.notionalUsd)} | ${txHash} |`
      );
    }
  }

  fs.writeFileSync(scoreboardMarkdownFile, `${markdownLines.join("\n")}\n`, "utf8");

  const report = {
    command: "proofboard",
    createdAt: new Date().toISOString(),
    totals: {
      executeReports: executes.length,
      auditReports: audits.length,
      passedAudits,
      passRatePercent: audits.length ? (passedAudits / audits.length) * 100 : 0,
      avgExecutionRatio: average(executionRatios),
      totalNotionalUsd: notionals.length ? notionals.reduce((sum, value) => sum + value, 0) : 0,
      maxNotionalUsd: notionals.length ? Math.max(...notionals) : 0
    },
    verdictBreakdown,
    recentExecutions,
    scoreboardMarkdownFile
  };

  const file = writeReport("proofboard", report);
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
    verdict,
    txScanBlocked: parsed.txScanGuard?.blocked ?? null,
    txScanRiskCount: parsed.txScanGuard?.riskCount ?? null,
    txScanWarnings: parsed.txScanGuard?.warnings ?? null,
    txScanRevertReason: parsed.txScanGuard?.revertReason ?? null
  };
  const file = writeReport("audit", summary);
  return { report: summary, file };
}

function phaseb(opts) {
  requireFields(opts, ["from", "to", "amount", "chain", "wallet"]);

  if (!isYes(opts["confirm-live"])) {
    throw new Error("Blocked: Phase B live flow requires --confirm-live yes");
  }

  const intelResult = intel({ to: opts.to, chain: opts.chain });
  if (!intelResult.report.recommendation.allowLiveTest && !isYes(opts["force-intel"])) {
    throw new Error(
      `Blocked by intel verdict (${intelResult.report.recommendation.verdict}). Use --force-intel yes to override.`
    );
  }

  const execResult = execute(opts);
  const auditResult = audit({ file: execResult.file });
  const boardResult = proofboard();

  const report = {
    command: "phaseb",
    createdAt: new Date().toISOString(),
    request: {
      from: opts.from,
      to: opts.to,
      amount: String(opts.amount),
      chain: opts.chain,
      wallet: opts.wallet
    },
    intel: {
      file: intelResult.file,
      verdict: intelResult.report.recommendation.verdict,
      score: intelResult.report.recommendation.score,
      allowLiveTest: intelResult.report.recommendation.allowLiveTest
    },
    execute: {
      file: execResult.file,
      txHash: execResult.report.execution?.swapTxHash || null,
      notionalUsd: execResult.report.guardrails?.notionalUsd || null
    },
    audit: {
      file: auditResult.file,
      verdict: auditResult.report.verdict,
      executionRatio: auditResult.report.executionRatio
    },
    proofboard: {
      file: boardResult.file,
      scoreboardMarkdownFile: boardResult.report.scoreboardMarkdownFile
    }
  };

  const file = writeReport("phaseb", report);
  return { report, file };
}

function phasec(opts) {
  requireFields(opts, ["from", "amount", "chain", "wallet"]);

  const scoutResult = scout({
    chain: opts.chain,
    "max-candidates": opts["max-candidates"] || "12",
    "min-signal-amount-usd": opts["min-signal-amount-usd"] || null,
    "time-frame": opts["time-frame"] || "3",
    "sort-by": opts["sort-by"] || "5",
    include: opts.include || null
  });

  const manualToken = normalizeTokenAddress(opts.to);
  const autoToken = scoutResult.report.nextCandidate?.tokenAddress || null;
  const selectedToken = manualToken || autoToken;

  if (!selectedToken) {
    throw new Error("Phase C could not find a candidate token. Try increasing --max-candidates.");
  }

  const selectedFromScout =
    scoutResult.report.ranking.find((item) => item.tokenAddress === selectedToken) || null;

  if (!isYes(opts["confirm-live"])) {
    const report = {
      command: "phasec",
      createdAt: new Date().toISOString(),
      mode: "dry_run",
      request: {
        from: opts.from,
        amount: String(opts.amount),
        chain: opts.chain,
        wallet: opts.wallet,
        to: selectedToken,
        manualTokenOverride: Boolean(manualToken)
      },
      scout: {
        file: scoutResult.file,
        candidateUniverseSize: scoutResult.report.candidateUniverseSize
      },
      selectedCandidate: selectedFromScout,
      nextAction:
        "Run again with --confirm-live yes to execute the selected token through Phase B pipeline."
    };
    const file = writeReport("phasec", report);
    return { report, file };
  }

  const phasebResult = phaseb({
    ...opts,
    to: selectedToken,
    "confirm-live": "yes"
  });

  const report = {
    command: "phasec",
    createdAt: new Date().toISOString(),
    mode: "live",
    request: {
      from: opts.from,
      amount: String(opts.amount),
      chain: opts.chain,
      wallet: opts.wallet,
      to: selectedToken,
      manualTokenOverride: Boolean(manualToken)
    },
    scout: {
      file: scoutResult.file,
      candidateUniverseSize: scoutResult.report.candidateUniverseSize
    },
    selectedCandidate: selectedFromScout,
    phaseb: {
      file: phasebResult.file,
      txHash: phasebResult.report.execute?.txHash || null,
      auditVerdict: phasebResult.report.audit?.verdict || null,
      notionalUsd: phasebResult.report.execute?.notionalUsd || null
    }
  };

  const file = writeReport("phasec", report);
  return { report, file };
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
  } else if (command === "intel") {
    result = intel(options);
  } else if (command === "scout") {
    result = scout(options);
  } else if (command === "proofboard") {
    result = proofboard();
  } else if (command === "phaseb") {
    result = phaseb(options);
  } else if (command === "phasec") {
    result = phasec(options);
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
