#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const ROOT_ARGS = process.argv.slice(2);

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

function runNodeCli(command, args) {
  const proc = spawnSync("node", ["src/cli.mjs", command, ...args], {
    encoding: "utf8",
    stdio: "pipe"
  });
  const out = `${proc.stdout || ""}${proc.stderr || ""}`.trim();
  if (proc.status !== 0) {
    throw new Error(out || `Command failed: ${command}`);
  }
  return out;
}

function main() {
  const opts = parseArgs(ROOT_ARGS);
  const required = ["from", "to", "amount", "chain", "wallet"];
  for (const key of required) {
    if (!opts[key]) throw new Error(`Missing --${key}`);
  }

  if (opts["confirm-live"] !== "yes") {
    throw new Error(
      "Blocked: live flow requires explicit confirmation flag --confirm-live yes"
    );
  }

  const baseArgs = [
    "--from",
    opts.from,
    "--to",
    opts.to,
    "--amount",
    opts.amount,
    "--chain",
    opts.chain,
    "--wallet",
    opts.wallet
  ];

  const sim = runNodeCli("simulate", baseArgs);
  const exec = runNodeCli("execute", baseArgs);
  const audit = runNodeCli("audit", []);

  console.log(
    JSON.stringify(
      {
        ok: true,
        simulate: JSON.parse(sim),
        execute: JSON.parse(exec),
        audit: JSON.parse(audit)
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

