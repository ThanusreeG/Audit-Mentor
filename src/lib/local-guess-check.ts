type VulnerabilityMetadata = {
  title: string;
  severity?: string;
  matchKeywords?: string[] | string;
  codeSnippet?: string;
  explanation?: string;
  reveal?: { code?: string; explanation?: string };
};

const MECHANISM_TERMS = [
  "access control",
  "onlyowner",
  "owner",
  "admin",
  "permission",
  "reentrancy",
  "external call",
  "state update",
  "checks effects",
  "replay",
  "signature",
  "chainid",
  "chain id",
  "domain separation",
  "nonce",
  "stale price",
  "oracle",
  "tx.origin",
  "tx origin",
  "unchecked return",
  "return value",
  "fee on transfer",
  "accounting",
  "slippage",
  "delegatecall",
  "initialize",
  "upgrade"
];

const VAGUE = /^(idk|i don'?t know|something|something wrong|looks weird|the function is bad|bad|bug|issue|vulnerable)$/i;

export function localCheckGuess(guess: string, vuln: VulnerabilityMetadata): { correct: boolean; reasoning: string; source: "local-fallback" } {
  const normalizedGuess = normalize(guess);
  if (!normalizedGuess || normalizedGuess.length < 4 || VAGUE.test(normalizedGuess)) {
    return {
      correct: false,
      reasoning: "That guess is too vague. Try naming the bug class and the mechanism, not just that something looks wrong.",
      source: "local-fallback"
    };
  }

  const code = vuln.reveal?.code || vuln.codeSnippet || "";
  const explanation = vuln.reveal?.explanation || vuln.explanation || "";
  const keywords = buildKeywordSet(vuln, code, explanation);
  const mechanismMatches = MECHANISM_TERMS.filter((term) => normalizedGuess.includes(normalize(term)) && keywords.has(normalize(term)));
  const matchedKeywords = [...keywords].filter((keyword) => keyword.length >= 3 && normalizedGuess.includes(keyword));
  const score = matchedKeywords.reduce((total, keyword) => total + Math.min(keyword.length, 18), 0);
  const functionName = extractFunctionName(code);
  const functionMatched = Boolean(functionName && normalizedGuess.includes(normalize(functionName)));
  const mechanism = mechanismMatches[0] || matchedKeywords.find((keyword) => MECHANISM_TERMS.some((term) => normalize(term) === keyword));
  const correct = score >= 6 && Boolean(mechanism);

  if (correct) {
    return {
      correct: true,
      reasoning: `Correct — your guess identifies ${mechanism} ${functionName ? `in ${functionName}` : "in the vulnerable code"}.`,
      source: "local-fallback"
    };
  }

  const nudge = functionMatched
    ? `You pointed at ${functionName}, but the mechanism is still missing. Name the bug class, such as reentrancy, replay, stale oracle, access control, or unchecked return.`
    : matchedKeywords.length
      ? `You matched ${matchedKeywords.slice(0, 2).join(", ")}, but not enough of the actual mechanism. Be more specific about how the bug works.`
      : "That does not match the issue I have in mind. Try naming both the function and the vulnerability mechanism.";

  return { correct: false, reasoning: nudge, source: "local-fallback" };
}

function buildKeywordSet(vuln: VulnerabilityMetadata, code: string, explanation: string) {
  const keywords = new Set<string>();
  parseKeywords(vuln.matchKeywords).forEach((keyword) => keywords.add(normalize(keyword)));
  [...MECHANISM_TERMS, ...extractIdentifiers(code), ...extractIdentifiers(vuln.title), ...extractIdentifiers(explanation)].forEach((keyword) => {
    const normalized = normalize(keyword);
    if (normalized.length >= 3) keywords.add(normalized);
  });
  return keywords;
}

function parseKeywords(value: string[] | string | undefined) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(",");
  }
}

function extractFunctionName(code: string) {
  return code.match(/function\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || "";
}

function extractIdentifiers(text = "") {
  return Array.from(text.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)).map(([word]) => word);
}

function normalize(value = "") {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^\w.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
