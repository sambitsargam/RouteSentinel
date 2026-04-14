function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function toNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function hasCriticalTokenRisk(tokenScan) {
  return Boolean(
    tokenScan &&
      (tokenScan.isHoneypot || tokenScan.isRiskToken || tokenScan.isRubbishAirdrop)
  );
}

export function classifyCliFailure(message) {
  const text = String(message || "").toLowerCase();

  if (text.includes("token scan blocked execution")) {
    return {
      code: "HONEYPOT_OR_TOKEN_RISK",
      reason: "Token risk gate blocked the trade before execution.",
      nextAction: "Switch token and rerun scout/routecheck."
    };
  }
  if (text.includes("exceeds cap")) {
    return {
      code: "NOTIONAL_CAP_EXCEEDED",
      reason: "Trade amount exceeds configured micro-test cap.",
      nextAction: "Lower trade amount or increase MAX_TEST_USD intentionally."
    };
  }
  if (text.includes("critical risk")) {
    return {
      code: "TX_SCAN_CRITICAL",
      reason: "Transaction risk scanner detected a critical issue.",
      nextAction: "Do not execute. Choose another route or token."
    };
  }
  if (text.includes("no quote route") || text.includes("non-positive output")) {
    return {
      code: "ROUTE_UNAVAILABLE",
      reason: "Quote engine could not produce a safe route.",
      nextAction: "Retry with a different token or smaller amount."
    };
  }

  return {
    code: "UPSTREAM_FAILURE",
    reason: "Upstream command failed before firewall decision could complete.",
    nextAction: "Check API connectivity and retry."
  };
}

function buildReject({ code, reason, nextAction, details }) {
  return {
    status: "REJECT",
    code,
    reason,
    nextAction,
    humanExplanation: `REJECTED: ${reason}`,
    machine: {
      decision: "reject",
      code,
      reason,
      details
    }
  };
}

function buildApprove({ details, warning }) {
  const warningText = warning ? ` Warning: ${warning}` : "";
  return {
    status: "APPROVE",
    code: "SAFE_TO_EXECUTE",
    reason: "All firewall checks passed.",
    nextAction: "Execute swap and publish proof artifacts.",
    humanExplanation: `APPROVED: All firewall checks passed.${warningText}`,
    machine: {
      decision: "approve",
      code: "SAFE_TO_EXECUTE",
      reason: "all_checks_passed",
      warning: warning || null,
      details
    }
  };
}

export function decideFirewall({ analysis, policy }) {
  const uniswapMode = String(policy?.uniswapMode || "prefer").toLowerCase();
  const requireUniswap = uniswapMode === "required";

  const routeRatio = toNumberOrNull(analysis?.routecheck?.metrics?.roundTripRatio);
  const routeLossPercent = toNumberOrNull(
    analysis?.routecheck?.metrics?.roundTripLossPercent
  );
  const tokenScan = analysis?.preview?.tokenScanSnapshot || null;
  const criticalTokenRisk = hasCriticalTokenRisk(tokenScan);
  const txScanGuard = analysis?.preview?.txScanGuard || null;
  const txRiskBlocked = Boolean(txScanGuard?.blocked);
  const txRiskCount = toNumberOrNull(txScanGuard?.riskCount);
  const dexNames = Array.isArray(analysis?.preview?.executionHints?.dexNames)
    ? analysis.preview.executionHints.dexNames
    : [];
  const hasUniswapRoute = Boolean(analysis?.preview?.executionHints?.hasUniswapRoute);

  const details = {
    candidateToken: analysis?.candidateToken || null,
    routeRatio,
    routeLossPercent,
    criticalTokenRisk,
    txRiskBlocked,
    txRiskCount,
    hasUniswapRoute,
    dexNames,
    notionalUsd: toNumberOrNull(analysis?.preview?.guardrails?.notionalUsd)
  };

  if (analysis?.previewError) {
    const fail = classifyCliFailure(analysis.previewError);
    return buildReject({
      code: fail.code,
      reason: fail.reason,
      nextAction: fail.nextAction,
      details
    });
  }

  if (analysis?.routecheckError) {
    const fail = classifyCliFailure(analysis.routecheckError);
    return buildReject({
      code: fail.code === "UPSTREAM_FAILURE" ? "ROUTECHECK_FAILURE" : fail.code,
      reason: "Route-quality evaluation failed.",
      nextAction: fail.nextAction,
      details
    });
  }

  if (criticalTokenRisk) {
    return buildReject({
      code: "HONEYPOT_OR_TOKEN_RISK",
      reason: "Token risk scanner flagged critical risk.",
      nextAction: "Block trade and switch to a different token.",
      details
    });
  }

  if (analysis?.routecheck && analysis.routecheck.recommendation?.allow === false) {
    return buildReject({
      code: "ROUTE_INEFFICIENT",
      reason: "Route-quality gate rejected this route.",
      nextAction: "Retry with next candidate route.",
      details
    });
  }

  if (txRiskBlocked) {
    return buildReject({
      code: "TX_SCAN_CRITICAL",
      reason: "Transaction scanner reported critical risk.",
      nextAction: "Do not execute this transaction.",
      details
    });
  }

  if (requireUniswap && !hasUniswapRoute) {
    return buildReject({
      code: "UNISWAP_ROUTE_REQUIRED",
      reason: "Policy requires a Uniswap route, but route does not include Uniswap.",
      nextAction: "Retry candidate selection with Uniswap route preference.",
      details
    });
  }

  let warning = null;
  if (uniswapMode === "prefer" && !hasUniswapRoute) {
    warning = "No Uniswap route detected; executed on safest available route.";
  }

  return buildApprove({ details, warning });
}

export function formatDecisionSummary(decision) {
  const checks = decision?.machine?.details || {};
  const ratio = isFiniteNumber(checks.routeRatio) ? Number(checks.routeRatio).toFixed(6) : "n/a";
  const loss = isFiniteNumber(checks.routeLossPercent)
    ? Number(checks.routeLossPercent).toFixed(4)
    : "n/a";
  const notional = isFiniteNumber(checks.notionalUsd)
    ? Number(checks.notionalUsd).toFixed(6)
    : "n/a";

  return [
    `decision=${decision.status}`,
    `code=${decision.code}`,
    `ratio=${ratio}`,
    `lossPct=${loss}`,
    `notionalUsd=${notional}`,
    `uniswap=${checks.hasUniswapRoute ? "yes" : "no"}`
  ].join(" | ");
}
