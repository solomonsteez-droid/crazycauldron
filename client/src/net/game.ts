/**
 * The client's copy of everything the server has told it about this player.
 *
 * Read-only by construction: nothing here is ever computed locally. Coins, XP,
 * levels, cooldowns and buffs all arrive from the server and are only stored so
 * a panel can render without asking again.
 */

import type { NodeStateView, ProfilePayload } from "@crazycauldron/shared";

type Listener = () => void;

export class GameStore {
  private profileData: ProfilePayload | null = null;
  private nodesBySection = new Map<number, Map<string, NodeStateView>>();
  private readonly listeners = new Set<Listener>();
  /** serverNow minus Date.now() at the last message, to age timers honestly. */
  private clockSkewMs = 0;

  get profile(): ProfilePayload | null {
    return this.profileData;
  }

  setProfile(profile: ProfilePayload) {
    this.profileData = profile;
    this.clockSkewMs = profile.serverNow - Date.now();
    this.emit();
  }

  setNodes(section: number, nodes: NodeStateView[], serverNow: number) {
    this.clockSkewMs = serverNow - Date.now();
    this.nodesBySection.set(section, new Map(nodes.map((n) => [n.id, n])));
    this.emit();
  }

  updateNode(section: number, node: NodeStateView) {
    const map = this.nodesBySection.get(section) ?? new Map<string, NodeStateView>();
    map.set(node.id, node);
    this.nodesBySection.set(section, map);
    this.emit();
  }

  nodes(section: number): NodeStateView[] {
    return [...(this.nodesBySection.get(section)?.values() ?? [])];
  }

  node(section: number, id: string): NodeStateView | undefined {
    return this.nodesBySection.get(section)?.get(id);
  }

  /** The server's clock, as best this client can tell. */
  serverNow(): number {
    return Date.now() + this.clockSkewMs;
  }

  /** Seconds until a node is gatherable again, or 0 when it is ready. */
  cooldownSeconds(section: number, id: string): number {
    const node = this.node(section, id);
    if (!node || node.readyAt === 0) return 0;
    return Math.max(0, Math.ceil((node.readyAt - this.serverNow()) / 1000));
  }

  buffSeconds(): number {
    const expires = this.profileData?.buffExpiresAt ?? 0;
    if (expires === 0) return 0;
    return Math.max(0, Math.ceil((expires - this.serverNow()) / 1000));
  }

  countIngredient(id: string): number {
    return this.profileData?.inventory.find((s) => s.kind === "ingredient" && s.id === id)?.qty ?? 0;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

/** One store per tab; the hub scene fills it and every panel reads from it. */
export const gameStore = new GameStore();
