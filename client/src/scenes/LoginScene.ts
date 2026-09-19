import Phaser from "phaser";
import { shortenAddress } from "@crazycauldron/shared";
import { ApiError, fetchCapacity, fetchNonce, verifySignature } from "../net/api.js";
import { loadSession, saveSession, type Session } from "../net/session.js";
import { WalletError, connectWallet, hasWallet, reconnectWallet, signMessage } from "../net/wallet.js";
import { showPanel, type PanelHandle } from "../ui/overlay.js";
import { describeEnterFailure, enterAndRoute } from "./enter.js";
import { SCENE_LOGIN } from "./keys.js";

interface LoginData {
  /** Set when another scene bounced the player back here. */
  error?: string;
}

/**
 * Wallet connect -> sign -> enter. The scene renders nothing on the canvas; the
 * whole screen is the DOM panel, and the canvas sits empty behind it.
 */
export class LoginScene extends Phaser.Scene {
  private panel!: PanelHandle;
  private address: string | null = null;

  constructor() {
    super(SCENE_LOGIN);
  }

  create(data: LoginData = {}) {
    this.cameras.main.setBackgroundColor("#14101a");

    this.panel = showPanel({
      title: "CrazyCauldron",
      body: hasWallet()
        ? "Connect a Solana wallet to enter the hub."
        : "No Solana wallet detected. Install Phantom and reload this page.",
      error: data.error,
      actions: [{ label: "Connect wallet", onClick: () => this.signIn() }],
      // Before connecting a wallet is exactly when somebody should be able to
      // check the contract address and read what the token is not.
      links: true,
    });

    void this.showCapacity();
    // Only auto-resume when nothing bounced us here; otherwise the player would
    // be thrown straight back into the failure they just read about.
    if (!data.error) void this.tryResume();
  }

  /** Reuses a live session from this tab, with no wallet popup at all. */
  private async tryResume() {
    const session = loadSession();
    if (!session) return;

    // Confirm the wallet is still the one that signed in; a switched account
    // should sign in again rather than inherit the previous session.
    const trusted = await reconnectWallet();
    if (trusted && trusted !== session.wallet) return;

    this.panel.setBody("Resuming your session\u2026");
    this.panel.setBusy(true);
    try {
      await enterAndRoute(this, session);
    } catch (err) {
      this.panel.setBusy(false);
      this.panel.setBody("Connect a Solana wallet to enter the hub.");
      this.panel.setError(describeEnterFailure(err));
    }
  }

  private async signIn() {
    this.panel.setError("");
    this.panel.setBusy(true);

    try {
      this.panel.setBody("Waiting for your wallet\u2026");
      this.address = await connectWallet();

      this.panel.setBody(`Sign in as ${shortenAddress(this.address)} to prove the wallet is yours.`);
      const { message } = await fetchNonce(this.address);
      const signature = await signMessage(message);

      this.panel.setBody("Checking your $COOK\u2026");
      const verified = await verifySignature({ address: this.address, message, signature });
      const session: Session = saveSession(verified);

      this.panel.setBody("Finding you a seat\u2026");
      await enterAndRoute(this, session);
    } catch (err) {
      this.panel.setBusy(false);
      this.panel.setBody(
        this.address
          ? `Connected as ${shortenAddress(this.address)}.`
          : "Connect a Solana wallet to enter the hub.",
      );
      this.panel.setError(this.explain(err));
    }
  }

  /** One place that turns every failure mode into something a player can act on. */
  private explain(err: unknown): string {
    if (err instanceof ApiError && err.isInsufficientHold) {
      const balance = err.body.balance ?? 0;
      const minHold = err.body.minHold ?? 0;
      return `You hold ${balance.toLocaleString()} $COOK. The hub needs ${minHold.toLocaleString()}.`;
    }
    if (err instanceof WalletError) return err.message;
    return describeEnterFailure(err);
  }

  private async showCapacity() {
    try {
      const capacity = await fetchCapacity();
      this.panel.setMeta(
        capacity.full
          ? `The hub is full (${capacity.hubPlayers}/${capacity.globalMax}) - you will join the queue.`
          : `${capacity.hubPlayers} of ${capacity.globalMax} wizards are in the cauldron.`,
      );
    } catch (err) {
      // A missing player count is not worth mentioning to the player, but a
      // malformed one means the endpoint moved - say so somewhere findable
      // rather than rendering "undefined of undefined".
      console.warn("Could not read hub capacity:", (err as Error).message);
    }
  }
}
