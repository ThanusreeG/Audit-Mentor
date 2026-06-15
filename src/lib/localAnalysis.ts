import type { DetectedSignals } from "./signals";

type LocalVulnerability = {
  title: string;
  severity: string;
  codeSnippet: string;
  explanation: string;
  attackScenario: string;
  impact: string;
  fix: string;
  learningNote: string;
  hint1: string;
  hint2: string;
  hint3: string;
  matchKeywords: string[];
};

export function classifyContractType(source: string, signals: DetectedSignals) {
  const lower = stripSolidityComments(source).toLowerCase();
  if (signals.bridgePatterns) return "Bridge";
  if (/staking|reward|rewarddebt|accrewardpershare/.test(lower)) return "Staking";
  if (/escrow|payment|paymatic|settle|cancel/.test(lower)) return "Escrow";
  if (/erc721|nft|mint|tokenuri/.test(lower)) return "NFT";
  if (/governor|proposal|vote|delegate/.test(lower)) return "Governance";
  if (/vault|shares|deposit|withdraw/.test(lower)) return "Vault";
  if (/borrow|lend|liquidat|collateral/.test(lower)) return "Lending";
  if (/keeper|eligib|allowlist|whitelist|blacklist|role|grant|revoke|accesscontrol|permission/.test(lower)) return "AccessControl";
  if (/registry|registrar|resolver|directory/.test(lower)) return "Registry";
  if (/pay|invoice|merchant|treasury/.test(lower)) return "Payment";
  if (signals.oracle) return "Oracle";
  if (/erc20|transferfrom|transfer\s*\(|balanceof|allowance/.test(lower)) return "Token";
  return "Unknown";
}

function stripSolidityComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function buildLocalRiskReasons(signals: DetectedSignals, contractType: string) {
  const reasons = [];
  if (signals.holdsFunds) reasons.push("This contract handles user funds, so logic mistakes can directly affect assets.");
  if (signals.tokenTransfers) reasons.push("It performs token transfers, which require careful accounting and return-value handling.");
  if (signals.signatures) reasons.push("It uses signature logic, where missing replay protection can be dangerous.");
  if (signals.oracle) reasons.push("It uses oracle data, so stale or manipulated prices must be checked.");
  if (!signals.accessControl && (signals.holdsFunds || signals.tokenTransfers)) {
    reasons.push("Privileged or fund-moving behavior should be checked for missing access control.");
  }
  if (!reasons.length) reasons.push(`${contractType} logic should be reviewed for state changes, permissions, and edge cases.`);
  return reasons.slice(0, 3);
}

export function detectLocalVulnerabilities(source: string, contractType: string): LocalVulnerability[] {
  const findings: LocalVulnerability[] = [];

  if (/tx\.origin/i.test(source)) {
    findings.push({
      title: "tx.origin authorization risk",
      severity: "High",
      codeSnippet: snippetAround(source, /tx\.origin/i),
      explanation: "Using tx.origin for authorization can allow phishing-style calls through an attacker-controlled contract.",
      attackScenario: "A user is tricked into calling a malicious contract, which then calls this contract while tx.origin is still the user.",
      impact: "An attacker may pass authorization checks and trigger privileged behavior.",
      fix: "Use msg.sender with explicit roles or ownership checks instead of tx.origin.",
      learningNote: "In Solidity authorization, prefer msg.sender and explicit access-control patterns.",
      hint1: "Look at the difference between the immediate caller and the original transaction sender.",
      hint2: "This is an authorization issue involving tx.origin.",
      hint3: "The code trusts tx.origin, which can be abused through an intermediate contract.",
      matchKeywords: ["tx.origin", "tx origin", "authorization", "phishing", "skim", "msg.sender"]
    });
  }

  const unprotectedSetter = findUnprotectedConfigFunction(source);
  if (unprotectedSetter) {
    findings.push({
      title: `Missing access control on ${unprotectedSetter.name}`,
      severity: "High",
      codeSnippet: unprotectedSetter.snippet,
      explanation: "A configuration-changing function appears callable by anyone because it lacks an owner or role check.",
      attackScenario: "An attacker calls the configuration function and points the contract at malicious infrastructure or a hostile address.",
      impact: "The attacker can change trusted configuration and influence fund movement or accounting.",
      fix: "Restrict the function with onlyOwner, AccessControl, or a governance-controlled role.",
      learningNote: "Begin audits by mapping every function that changes important state and checking who can call it.",
      hint1: "Check who is allowed to call configuration functions.",
      hint2: "This is an access-control issue around a state-changing setter.",
      hint3: `${unprotectedSetter.name} changes important state but does not show an onlyOwner or role check.`,
      matchKeywords: [unprotectedSetter.name, "onlyOwner", "access control", "owner", "admin", "permission", "configuration"]
    });
  }

  if (/\.call\s*\{\s*value/i.test(source) && /-=\s*amount|balanceOf\[[\s\S]*?\]\s*-=/.test(source)) {
    findings.push({
      title: "Reentrancy risk in withdrawal flow",
      severity: "High",
      codeSnippet: snippetAround(source, /\.call\s*\{\s*value/i),
      explanation: "The contract sends Ether to a user-controlled address before clearly finishing internal balance updates.",
      attackScenario: "A malicious receiver reenters the withdrawal function during the Ether transfer and withdraws more than intended.",
      impact: "Contract Ether can be drained or user balances can become inconsistent.",
      fix: "Apply checks-effects-interactions, update balances before external calls, or use ReentrancyGuard.",
      learningNote: "When Ether is sent out, inspect whether state is updated before the external call.",
      hint1: "Look at the order of operations when sending Ether to a user-controlled address.",
      hint2: "This is a reentrancy pattern around a withdrawal-style function.",
      hint3: "Ether is sent before the relevant balance is reduced.",
      matchKeywords: ["withdraw", "reentrancy", "call value", "sends eth", "updating balance", "balance", "external call"]
    });
  }

  if (/latestRoundData/i.test(source) && !/updatedAt\s*[+<>=]|block\.timestamp\s*-\s*updatedAt|answeredInRound/i.test(source)) {
    findings.push({
      title: "Oracle stale price risk",
      severity: "Medium",
      codeSnippet: snippetAround(source, /latestRoundData/i),
      explanation: "The contract reads oracle data without clearly validating freshness or round completeness.",
      attackScenario: "If the oracle returns stale data, users can deposit, withdraw, or settle using an outdated price.",
      impact: "Accounting can be wrong and users may receive too much or too little value.",
      fix: "Check updatedAt, answeredInRound, price bounds, and a maximum staleness window.",
      learningNote: "Oracle reads should validate both the value and whether the value is fresh enough to trust.",
      hint1: "Look at what is checked after reading the oracle price.",
      hint2: "This is about stale oracle data.",
      hint3: "latestRoundData is used without a clear updatedAt freshness check.",
      matchKeywords: ["oracle", "latestRoundData", "stale price", "updatedAt", "price", "aggregator"]
    });
  }

  if (/(ecrecover|recoverSigner|ECDSA|\.recover\s*\()/i.test(source)) {
    const digestSnippet = snippetAround(source, /keccak256\s*\(\s*abi\.encode/i);
    if (!/chainid|block\.chainid|address\s*\(\s*this\s*\)|verifyingContract/i.test(digestSnippet)) {
      findings.push({
        title: "Signature replay/domain separation risk",
        severity: "High",
        codeSnippet: digestSnippet,
        explanation: "The signed message may not include enough domain information such as chain ID or contract address.",
        attackScenario: "A signature intended for one chain, contract, or context may be reused somewhere else if the same signer is trusted.",
        impact: "Attackers may replay claims or authorizations and move funds incorrectly.",
        fix: "Include chain ID, address(this), nonce or claim ID, receiver, amount, and intent in the signed digest.",
        learningNote: "For signatures, always check exactly which values are signed and which replay domains are included.",
        hint1: "Look at the parameters included in the signed message.",
        hint2: "Check whether chain ID and contract address are part of the signature digest.",
        hint3: "The claim signature may be replayable if the digest omits domain separation values.",
        matchKeywords: ["signature", "replay", "chainId", "chain id", "address(this)", "claim", "nonce", "domain"]
      });
    }
  }

  if (/(^|[^.])\btoken\.transfer\s*\(|\bIERC20\b[\s\S]*\.transfer\s*\(/i.test(source) && !/safeTransfer|require\s*\([^;]*transfer/i.test(source)) {
    findings.push({
      title: "Unchecked ERC20 transfer return value",
      severity: "Medium",
      codeSnippet: snippetAround(source, /\.transfer\s*\(/i),
      explanation: "The contract calls ERC20 transfer without clearly checking the returned boolean or using SafeERC20.",
      attackScenario: "A token returns false instead of reverting, but the contract continues as if the transfer succeeded.",
      impact: "Claims, settlements, or accounting can be marked complete without actual token movement.",
      fix: "Use SafeERC20.safeTransfer or require that transfer returns true.",
      learningNote: "ERC20 behavior varies; audits should check whether token transfer results are handled.",
      hint1: "Check whether token movement success is verified.",
      hint2: "This is an ERC20 return-value handling issue.",
      hint3: "A transfer call is made without SafeERC20 or an explicit success check.",
      matchKeywords: ["unchecked return", "transfer", "erc20", "safeTransfer", "return value", "claim"]
    });
  }

  if (/transferFrom\s*\([^;]+address\s*\(\s*this\s*\)[^;]+amount/i.test(source) && /balanceOf|balances|shares|deposit/i.test(source)) {
    findings.push({
      title: "Token accounting may assume exact received amount",
      severity: "Medium",
      codeSnippet: snippetAround(source, /transferFrom\s*\(/i),
      explanation: "The contract appears to credit the requested amount rather than measuring how many tokens were actually received.",
      attackScenario: "With fee-on-transfer or deflationary tokens, the contract receives less than expected but credits the full amount.",
      impact: "Accounting can become inflated and later withdrawals or settlements may be undercollateralized.",
      fix: "Measure token balance before and after transferFrom and credit the actual received amount.",
      learningNote: "For token deposits, compare requested amount with actual balance delta.",
      hint1: "Compare the amount requested with the amount the contract actually receives.",
      hint2: "This is a fee-on-transfer token accounting issue.",
      hint3: "The deposit flow credits amount without measuring the actual received token balance delta.",
      matchKeywords: ["fee on transfer", "transferFrom", "actual received", "balance delta", "accounting", "deposit"]
    });
  }

  return dedupe(findings).slice(0, 6);
}

function findUnprotectedConfigFunction(source: string) {
  const pattern = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(external|public)([^{;]*)\{([\s\S]*?)\n\s*\}/g;
  for (const match of source.matchAll(pattern)) {
    const [, name, , modifiers, body] = match;
    if (!/^(set|update|configure|change|pause|unpause|setFee|setOracle|setSigner)/i.test(name)) continue;
    if (/onlyOwner|hasRole|requiresRole|auth|owner/i.test(modifiers) || /require\s*\([^;]*(owner|hasRole|admin|msg\.sender\s*==)/i.test(body)) {
      continue;
    }
    return { name, snippet: match[0].slice(0, 900) };
  }
  return null;
}

function snippetAround(source: string, pattern: RegExp) {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) return lines.slice(0, 12).join("\n");
  return lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 8)).join("\n");
}

function dedupe(findings: LocalVulnerability[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = finding.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
