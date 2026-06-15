export type DetectedSignals = {
  holdsFunds: boolean;
  externalCalls: boolean;
  tokenTransfers: boolean;
  accessControl: boolean;
  signatures: boolean;
  oracle: boolean;
  upgradeable: boolean;
  complexAccounting: boolean;
  bridgePatterns: boolean;
  safeLibsUsed: boolean;
  hasChecks: boolean;
  checksCount: number;
};

export function detectSignals(source: string): DetectedSignals {
  return {
    holdsFunds: has(source, [/payable/i, /msg\.value/i, /\.transfer\s*\(/i, /\.call\s*\{\s*value/i]),
    externalCalls: has(source, [/\.call\s*\(/i, /\.call\s*\{/i, /\.delegatecall\s*\(/i, /\.staticcall\s*\(/i]),
    tokenTransfers: has(source, [/transfer\s*\(/i, /transferFrom\s*\(/i, /safeTransfer/i]),
    accessControl: has(source, [/onlyOwner/i, /Ownable/i, /AccessControl/i, /hasRole/i]),
    signatures: has(source, [/ecrecover/i, /recoverSigner/i, /EIP712/i, /verifySignature/i, /ECDSA/i, /\.recover\s*\(/i]),
    oracle: has(source, [/latestRoundData/i, /AggregatorV3/i, /getPrice/i, /oracle/i, /priceFeed/i]),
    upgradeable: has(source, [/initialize\s*\(/i, /_authorizeUpgrade/i, /UUPS/i, /proxy/i, /delegatecall/i]),
    complexAccounting: has(source, [/accRewardPerShare/i, /rewardDebt/i, /shares/i, /totalShares/i, /exchangeRate/i]),
    bridgePatterns: has(source, [/chainId/i, /nonce/i, /claim\s*\(/i, /relay/i, /messageHash/i]),
    safeLibsUsed: has(source, [/using\s+SafeERC20/i, /openzeppelin/i, /SafeERC20/i]),
    hasChecks: has(source, [/require\s*\(/i, /revert\s*\(/i, /error\s+[A-Za-z_]/i]),
    checksCount: count(source, /require\s*\(|revert\s*\(|error\s+[A-Za-z_]/gi)
  };
}

function has(source: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(source));
}

function count(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}
