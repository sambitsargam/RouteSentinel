#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function askWithDefault(rl, prompt, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return rl.question(`${prompt}${suffix}: `).then((answer) => {
    const value = String(answer || "").trim();
    return value || defaultValue;
  });
}

function parseJson(raw) {
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

async function main() {
  const rl = createInterface({ input, output });

  try {
    console.log("RouteSentinel Setup Wizard");
    console.log("This wizard runs the judge flow (dry-run by default).\n");

    const wallet = await askWithDefault(rl, "Wallet address (required)", "");
    if (!wallet) throw new Error("Wallet is required.");

    const chain = await askWithDefault(rl, "Chain", "xlayer");
    const from = await askWithDefault(
      rl,
      "From token address",
      "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    );
    const amount = await askWithDefault(rl, "Amount", "0.0025");
    const maxCandidates = await askWithDefault(rl, "Max candidates", "6");
    const qualityCandidates = await askWithDefault(rl, "Quality candidates", "4");
    const tokenOverride = await askWithDefault(rl, "Token override (optional)", "");
    const include = await askWithDefault(rl, "Extra include tokens CSV (optional)", "");

    const mode = (await askWithDefault(rl, "Mode (dry/live)", "dry")).toLowerCase();
    const confirmLive = mode === "live";

    if (confirmLive) {
      const confirm = await askWithDefault(
        rl,
        "Type YES to confirm live execution",
        "NO"
      );
      if (confirm !== "YES") {
        throw new Error("Live mode cancelled. Confirmation was not YES.");
      }
    }

    const args = [
      "src/judge.mjs",
      "--wallet",
      wallet,
      "--chain",
      chain,
      "--from",
      from,
      "--amount",
      amount,
      "--max-candidates",
      maxCandidates,
      "--quality-candidates",
      qualityCandidates
    ];

    if (tokenOverride) args.push("--to", tokenOverride);
    if (include) args.push("--include", include);
    if (confirmLive) args.push("--confirm-live", "yes");

    console.log("\nRunning judge flow...\n");

    const proc = spawnSync("node", args, {
      encoding: "utf8",
      stdio: "pipe"
    });

    const merged = `${proc.stdout || ""}${proc.stderr || ""}`.trim();
    const parsed = parseJson(merged);

    if (proc.status !== 0 || !parsed?.ok) {
      const message = parsed?.error || merged || "Wizard run failed.";
      throw new Error(message);
    }

    console.log("Run complete.");
    console.log(`Mode: ${parsed.summary.mode}`);
    console.log(`Selected token: ${parsed.summary.selectedSymbol || "n/a"} (${parsed.summary.selectedToken || "n/a"})`);
    console.log(`Audit verdict: ${parsed.summary.auditVerdict}`);
    console.log(`Tx hash: ${parsed.summary.txHash || "dry-run (no tx)"}`);
    console.log(`Judge file: ${parsed.files.judgeFile}`);
    console.log(`PhaseC report: ${parsed.files.phasecFile}`);
    console.log(`Scoreboard: ${parsed.files.scoreboardFile || "n/a"}`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
