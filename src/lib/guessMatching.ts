import { Vulnerability } from "@prisma/client";

export type GuessMatch = {
  vulnerability: Vulnerability;
  score: number;
};

const THRESHOLD = 4;

const CLASS_TERMS = [
  "access control",
  "onlyowner",
  "owner",
  "admin",
  "permission",
  "reentrancy",
  "reentrant",
  "checks effects interactions",
  "replay",
  "signature",
  "chainid",
  "chain id",
  "nonce",
  "claim",
  "stale price",
  "oracle",
  "latestrounddata",
  "tx.origin",
  "tx origin",
  "unchecked return",
  "transfer",
  "transferfrom",
  "safetransfer",
  "fee on transfer",
  "slippage",
  "delegatecall",
  "initialize",
  "upgrade",
  "withdraw",
  "deposit"
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "function",
  "external",
  "public",
  "private",
  "internal",
  "returns",
  "return",
  "contract",
  "address",
  "uint256",
  "string",
  "bool"
]);

export function matchGuessToVulnerability(guess: string, vulnerabilities: Vulnerability[]) {
  const normalizedGuess = normalize(guess);
  if (normalizedGuess.length < 3) return null;

  let best: GuessMatch | null = null;
  for (const vulnerability of vulnerabilities) {
    if (vulnerability.resolved) continue;
    const score = scoreGuess(normalizedGuess, vulnerability);
    if (!best || score > best.score) best = { vulnerability, score };
  }

  return best && best.score >= THRESHOLD ? best : null;
}

export function scoreGuess(rawGuess: string, vulnerability: Vulnerability) {
  const guess = normalize(rawGuess);
  const keywords = collectKeywords(vulnerability);
  let score = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword || normalizedKeyword.length < 3) continue;
    if (guess.includes(normalizedKeyword)) {
      score += Math.max(1, Math.min(normalizedKeyword.length, 24));
    }
  }

  return score;
}

export function collectKeywords(vulnerability: Vulnerability) {
  const fromModel = parseKeywords(vulnerability.matchKeywords);
  const text = [vulnerability.title, vulnerability.codeSnippet, vulnerability.explanation].join(" ");
  const identifiers = Array.from(text.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g))
    .map(([word]) => word)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()));
  const classTerms = CLASS_TERMS.filter((term) => normalize(text).includes(normalize(term)));

  return [...new Set([...fromModel, ...classTerms, ...identifiers])];
}

export function buildWrongGuessExplanation(guess: string, contractType?: string | null) {
  const normalizedGuess = normalize(guess);
  if (normalizedGuess.includes("constructor")) {
    return "The constructor only runs once at deployment and is not callable later, so it usually is not the main attack surface. Look at functions callable after deployment that move funds or change permissions.";
  }

  if (normalizedGuess.length < 8 || /something|wrong|bug|issue|suspicious/.test(normalizedGuess)) {
    return "That guess is too broad to connect to a specific hidden issue. Try naming a function, a code line, or a bug class like reentrancy, replay, stale price, or access control.";
  }

  if (normalizedGuess.includes("view") || normalizedGuess.includes("pure")) {
    return "View or pure functions usually do not change state or move funds directly. Try checking state-changing functions, token transfers, signatures, or privileged configuration.";
  }

  if (normalizedGuess.includes("onlyowner") || normalizedGuess.includes("only owner")) {
    return "A protected owner-only path is not automatically a vulnerability. Try checking whether sensitive functions are missing protection or whether fund-moving logic can be abused.";
  }

  const nudge =
    contractType === "Bridge"
      ? "For this contract type, replay protection, signature scope, claim uniqueness, token transfers, and admin controls are good places to inspect."
      : "Try checking fund movement, permission changes, external calls, accounting, signatures, or oracle data.";

  return `This does not match a detected vulnerability pattern strongly enough. ${nudge}`;
}

function parseKeywords(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}
