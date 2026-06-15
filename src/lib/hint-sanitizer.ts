const BANNED_PATTERNS = [
  /\bthinking(?:\s+process)?\b/i,
  /\banalysis\b/i,
  /\bprocess\b/i,
  /\bself-correction\b/i,
  /\brefinement\b/i,
  /\binitial draft\b/i,
  /\bdraft hint\b/i,
  /\bformulate\b/i,
  /\breasoning\b/i,
  /\bplan\b/i,
  /\bstep\s+\d+\b/i
];

const PREFIX_PATTERNS = [
  /^(?:final\s+)?hint\s*:\s*/i,
  /^(?:here(?:'s| is)\s+)?(?:the\s+)?hint\s*:\s*/i,
  /^answer\s*:\s*/i
];

export function sanitizeHint(raw: string): string | null {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*|```/gi, ""))
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => !BANNED_PATTERNS.some((pattern) => pattern.test(paragraph)))
    .at(-1);

  if (!cleaned) return null;

  let hint = cleaned
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter((line) => line && !BANNED_PATTERNS.some((pattern) => pattern.test(line)))
    .join(" ");

  for (const pattern of PREFIX_PATTERNS) hint = hint.replace(pattern, "");

  hint = hint
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();

  if (hint.length > 400) {
    const truncated = hint.slice(0, 400);
    const lastSentence = Math.max(truncated.lastIndexOf("."), truncated.lastIndexOf("?"), truncated.lastIndexOf("!"));
    hint = lastSentence > 80 ? truncated.slice(0, lastSentence + 1) : `${truncated.trim()}...`;
  }

  if (hint.length < 20) return null;
  if (containsBannedHintText(hint)) return null;
  return hint;
}

export function containsBannedHintText(value: string) {
  return BANNED_PATTERNS.some((pattern) => pattern.test(value)) || PREFIX_PATTERNS.some((pattern) => pattern.test(value));
}

