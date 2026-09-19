/**
 * Sign-In With Solana message format. Built here so the client renders exactly
 * what the server later re-parses; the server never trusts the parsed fields
 * beyond checking them against its own nonce store.
 */

export interface SiwsMessageParts {
  domain: string;
  address: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  statement?: string;
}

const STATEMENT = "Sign in to CrazyCauldron. This request will not trigger a transaction or cost any fees.";

export function buildSiwsMessage(parts: SiwsMessageParts): string {
  const statement = parts.statement ?? STATEMENT;
  return [
    `${parts.domain} wants you to sign in with your Solana account:`,
    parts.address,
    "",
    statement,
    "",
    `URI: ${parts.uri}`,
    "Version: 1",
    `Nonce: ${parts.nonce}`,
    `Issued At: ${parts.issuedAt}`,
  ].join("\n");
}

export interface ParsedSiwsMessage {
  address: string | null;
  nonce: string | null;
  issuedAt: string | null;
}

export function parseSiwsMessage(message: string): ParsedSiwsMessage {
  const lines = message.split("\n");
  const field = (label: string): string | null => {
    const line = lines.find((l) => l.startsWith(`${label}: `));
    return line ? line.slice(label.length + 2).trim() : null;
  };
  return {
    // Line 0 is the "<domain> wants you to..." header, line 1 is the address.
    address: lines[1]?.trim() || null,
    nonce: field("Nonce"),
    issuedAt: field("Issued At"),
  };
}
