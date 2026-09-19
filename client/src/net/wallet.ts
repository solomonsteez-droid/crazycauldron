import bs58 from "bs58";

/**
 * The slice of the injected Solana provider we actually use. Typed by hand
 * rather than pulling in @solana/wallet-adapter: the skeleton only needs
 * connect + signMessage, and the adapter stack is a large dependency to carry
 * for two calls.
 */
interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect?(): Promise<void>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

export class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletError";
  }
}

export function getProvider(): SolanaProvider | null {
  return window.phantom?.solana ?? window.solana ?? null;
}

export function hasWallet(): boolean {
  return getProvider() !== null;
}

/** Prompts the wallet to connect and returns the base58 address. */
export async function connectWallet(): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    throw new WalletError("No Solana wallet found. Install Phantom, then reload.");
  }
  try {
    const { publicKey } = await provider.connect();
    return publicKey.toString();
  } catch (err) {
    // Wallets reject with code 4001 when the user dismisses the popup.
    throw new WalletError(
      (err as { message?: string }).message ?? "Wallet connection was declined.",
    );
  }
}

/** Reconnects silently if this site is already trusted; null if it is not. */
export async function reconnectWallet(): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const { publicKey } = await provider.connect({ onlyIfTrusted: true });
    return publicKey.toString();
  } catch {
    return null;
  }
}

/**
 * Signs the server's message verbatim and returns a base58 signature.
 *
 * The message is never modified here - /auth/verify re-renders its own copy and
 * rejects any difference, so touching it would only break sign-in.
 */
export async function signMessage(message: string): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new WalletError("No Solana wallet found.");
  try {
    const encoded = new TextEncoder().encode(message);
    const { signature } = await provider.signMessage(encoded, "utf8");
    return bs58.encode(signature);
  } catch (err) {
    throw new WalletError(
      (err as { message?: string }).message ?? "Signing was declined in your wallet.",
    );
  }
}
