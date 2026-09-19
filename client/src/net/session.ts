import type { VerifyResponse } from "@crazycauldron/shared";

const KEY = "crazycauldron.session";

export interface Session {
  token: string;
  wallet: string;
  displayName: string;
}

/**
 * sessionStorage, not localStorage: the token lives an hour and should not
 * outlive the tab. Every accessor is defensive because private-browsing modes
 * can make storage throw rather than return empty.
 */
export function saveSession(verify: VerifyResponse): Session {
  const session: Session = {
    token: verify.token,
    wallet: verify.wallet,
    displayName: verify.displayName,
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Non-fatal: the in-memory copy carries this tab through.
  }
  return session;
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.token || !parsed.wallet) return null;
    return {
      token: parsed.token,
      wallet: parsed.wallet,
      displayName: parsed.displayName ?? parsed.wallet,
    };
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the caller is already moving the player back to login.
  }
}
