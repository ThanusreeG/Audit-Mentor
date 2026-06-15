export type ContractDeclarationSummary = {
  concreteContracts: string[];
  interfaces: string[];
  libraries: string[];
};

export function summarizeContractDeclarations(source: string): ContractDeclarationSummary {
  const stripped = stripSolidityComments(source);
  return {
    concreteContracts: collectDeclarationNames(stripped, /\b(?:abstract\s+)?contract\s+([A-Za-z_][A-Za-z0-9_]*)\b/g),
    interfaces: collectDeclarationNames(stripped, /\binterface\s+([A-Za-z_][A-Za-z0-9_]*)\b/g),
    libraries: collectDeclarationNames(stripped, /\blibrary\s+([A-Za-z_][A-Za-z0-9_]*)\b/g)
  };
}

export function validateSingleConcreteContract(source: string): { ok: true; contractName: string } | { ok: false; error: string } {
  const summary = summarizeContractDeclarations(source);

  if (summary.concreteContracts.length === 0) {
    return {
      ok: false,
      error: "Paste one Solidity contract. Interfaces or libraries can support it, but the mentor needs one concrete contract to study."
    };
  }

  if (summary.concreteContracts.length > 1) {
    return {
      ok: false,
      error:
        "This mentor accepts one concrete Solidity contract at a time. It is not an audit scanning tool; paste one contract so the LLM can build a focused learning session."
    };
  }

  return { ok: true, contractName: summary.concreteContracts[0] };
}

function collectDeclarationNames(source: string, pattern: RegExp) {
  return Array.from(source.matchAll(pattern), (match) => match[1]);
}

function stripSolidityComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
