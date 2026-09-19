/**
 * The panels: bag, skills, codex, tavern, outfitter and leaderboard.
 *
 * Every number shown here came from the server. Nothing in this file computes a
 * level, a price, a cooldown or an unlock - it formats what the last profile
 * message said, and re-renders whenever a new one arrives.
 */

import {
  CONFIG,
  LEADERBOARD_POLL_MS,
  RECIPES,
  findIngredient,
  findRecipe,
  type InventoryStackView,
  type LeaderboardPayload,
  type ProfilePayload,
  type Quality,
} from "@crazycauldron/shared";
import { apronKey, bodyKey, dishKey, hatKey, ingredientKey } from "../art/assets.js";
import { defaultOffsets, loadArt, type Manifest, type OffsetsFile } from "../art/manifest.js";
import { fetchLeaderboard } from "../net/api.js";
import { gameStore } from "../net/game.js";
import { openModal, toast, type ModalHandle } from "./overlay.js";
import { sound, type Channel } from "../world/sound.js";

export interface PanelCallbacks {
  onEat(stackKey: string): void;
  onSell(stackKey: string, qty: number): void;
  onBuy(kind: "pan" | "bag", tier: number): void;
}

/** Re-renders a panel body on every profile change until the panel closes. */
function live(modal: ModalHandle, render: (profile: ProfilePayload) => void) {
  const draw = () => {
    const profile = gameStore.profile;
    if (profile) render(profile);
  };
  const unsubscribe = gameStore.onChange(draw);
  modal.onClose(unsubscribe);
  draw();
}

/**
 * A texture from the game, drawn into the DOM.
 *
 * Panels are HTML while the art lives in Phaser's texture manager, so the
 * pixels are copied onto a canvas rather than loaded a second time as an
 * <img>. Works the same whether the texture is a processed sprite or the
 * lettered placeholder standing in for one.
 */
export function icon(key: string, size = 28): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "cc-icon";
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  const game = (window as unknown as { __ccGame?: Phaser.Game }).__ccGame;
  if (!context || !game || !game.textures.exists(key)) return canvas;

  context.imageSmoothingEnabled = false;
  const texture = game.textures.get(key);
  const source = texture.getSourceImage() as CanvasImageSource | undefined;
  if (!source) return canvas;

  const w = texture.source[0]?.width ?? size;
  const h = texture.source[0]?.height ?? size;
  const scale = Math.max(1, Math.floor(Math.min(size / w, size / h)));
  context.drawImage(
    source,
    Math.floor((size - w * scale) / 2),
    Math.floor((size - h * scale) / 2),
    w * scale,
    h * scale,
  );
  return canvas;
}

/**
 * A garment shown on a body, for the wardrobe grid.
 *
 * A hat on its own is an unrecognisable smear of 18 pixels; on a head it is a
 * hat. The body is the idle front pose and the garment sits at its saved
 * offset, so the preview is exactly what the player will be wearing.
 */
function wardrobePreview(kind: "hat" | "apron", id: string, size = 48): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scale = Math.max(1, Math.floor(size / 48));
  canvas.width = 32 * scale;
  canvas.height = 48 * scale;

  const context = canvas.getContext("2d");
  const game = (window as unknown as { __ccGame?: Phaser.Game }).__ccGame;
  if (!context || !game) return canvas;
  context.imageSmoothingEnabled = false;

  const draw = (key: string, dx: number, dy: number) => {
    if (!game.textures.exists(key)) return;
    const texture = game.textures.get(key);
    const source = texture.getSourceImage() as CanvasImageSource | undefined;
    if (!source) return;
    const w = texture.source[0]?.width ?? 0;
    const h = texture.source[0]?.height ?? 0;
    context.drawImage(source, dx * scale, dy * scale, w * scale, h * scale);
  };

  // The body frame is a cell inside the atlas, so it is drawn by hand.
  const bodyTexture = game.textures.get(bodyKey("male"));
  // Phaser types the frame map loosely; the atlas is ours and the name is known.
  const frames = bodyTexture?.frames as
    | Record<string, { cutX: number; cutY: number; width: number; height: number }>
    | undefined;
  const frame = frames?.["male_idle_down"];
  const source = bodyTexture?.getSourceImage() as CanvasImageSource | undefined;
  if (frame && source) {
    context.drawImage(
      source,
      frame.cutX,
      frame.cutY,
      frame.width,
      frame.height,
      0,
      0,
      frame.width * scale,
      frame.height * scale,
    );
  }

  if (id) {
    const art = wardrobeArt;
    const entry = art?.manifest[kind === "hat" ? "hats" : "aprons"].find((e) => e.id === id);
    const saved = art?.offsets[kind === "hat" ? "hats" : "aprons"]?.[id] ?? defaultOffsets(entry);
    draw(kind === "hat" ? hatKey(id) : apronKey(id), saved.down.x, saved.down.y);
  }
  return canvas;
}

/** Filled once so the preview can read offsets without awaiting per item. */
let wardrobeArt: { manifest: Manifest; offsets: OffsetsFile } | null = null;
void loadArt().then((art) => {
  wardrobeArt = art;
});

function row(): HTMLElement {
  const element = document.createElement("div");
  element.className = "cc-row";
  return element;
}

function labelled(title: string, detail: string): HTMLElement {
  const wrap = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = detail;
  wrap.append(strong, document.createElement("br"), small);
  return wrap;
}

function button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = "cc-btn";
  element.textContent = label;
  element.disabled = disabled;
  element.addEventListener("click", onClick);
  return element;
}

/** Seconds remaining on a perishable stack, using the server's clock. */
function expiryNote(stack: InventoryStackView): string {
  if (!stack.expiresAt) return "";
  const seconds = Math.max(0, Math.ceil((stack.expiresAt - gameStore.serverNow()) / 1000));
  return ` · melts in ${seconds}s`;
}

// --- bag -------------------------------------------------------------------

export function openInventory(callbacks: PanelCallbacks): ModalHandle {
  const modal = openModal("Bag");
  const list = document.createElement("div");
  list.className = "cc-list";
  const summary = document.createElement("p");
  modal.body.append(summary, list);

  live(modal, (profile) => {
    summary.textContent = `${profile.usedSlots} of ${profile.carrySlots} slots · ${profile.coins} coins`;
    list.replaceChildren();

    if (profile.inventory.length === 0) {
      const empty = document.createElement("small");
      empty.textContent = "Your bag is empty. There is sunwheat in the Meadows.";
      list.append(empty);
      return;
    }

    for (const stack of profile.inventory) {
      const entry = row();
      const kind = stack.kind === "dish" ? "dish" : (findIngredient(stack.id)?.rarity ?? "");
      entry.append(
        icon(stack.kind === "dish" ? dishKey(stack.id) : ingredientKey(stack.id)),
        labelled(`${stack.qty} x ${stack.name}`, `${kind}${expiryNote(stack)}`),
      );

      if (stack.kind === "dish") {
        entry.append(button("Eat", () => callbacks.onEat(stack.key)));
      }
      list.append(entry);
    }
  });

  return modal;
}

// --- skills ----------------------------------------------------------------

export function openSkills(): ModalHandle {
  const modal = openModal("Skills");
  const list = document.createElement("div");
  list.className = "cc-list";
  const chef = document.createElement("p");
  modal.body.append(chef, list);

  live(modal, (profile) => {
    chef.textContent = profile.chefMaxed
      ? `Chef Level ${profile.chefLevel} (max)`
      : `Chef Level ${profile.chefLevel} · ${profile.chefIntoLevel}/${profile.chefLevelSpan} XP`;

    list.replaceChildren();
    for (const skill of profile.skills) {
      const entry = row();
      entry.style.display = "block";

      const heading = document.createElement("strong");
      heading.textContent = `${skill.name} ${skill.level}`;

      const meter = document.createElement("div");
      meter.className = "cc-meter";
      const fill = document.createElement("i");
      const fraction = skill.maxed ? 1 : skill.intoLevel / Math.max(skill.levelSpan, 1);
      fill.style.width = `${fraction * 100}%`;
      meter.append(fill);

      const detail = document.createElement("small");
      detail.textContent = skill.maxed
        ? `Mastered · ${CONFIG.skills.titles[skill.id]}`
        : `${skill.intoLevel}/${skill.levelSpan} XP · ${skill.nextUnlock ?? "nothing left to unlock"}`;

      entry.append(heading, meter, detail);
      list.append(entry);
    }

    if (profile.titles.length > 0) {
      const titles = document.createElement("p");
      titles.textContent = `Titles: ${profile.titles.join(", ")}`;
      list.append(titles);
    }
  });

  return modal;
}

// --- codex -----------------------------------------------------------------

const QUALITY_MARK: Record<Quality, string> = {
  common: "Common",
  fine: "Fine",
  superb: "Superb",
};

export function openCodex(): ModalHandle {
  const modal = openModal("Recipe codex");
  const list = document.createElement("div");
  list.className = "cc-list";
  const summary = document.createElement("p");
  modal.body.append(summary, list);

  live(modal, (profile) => {
    const cooked = new Map(profile.codex.map((entry) => [entry.recipeId, entry]));
    summary.textContent = `${cooked.size} of ${RECIPES.length} recipes discovered`;

    list.replaceChildren();
    for (const recipe of RECIPES) {
      const entry = cooked.get(recipe.id);
      const line = row();

      if (!entry?.cooked) {
        // Silhouette: the shape of the dish, not the dish. The icon is
        // blacked out by CSS rather than omitted, so the row keeps its rhythm.
        line.className = "cc-row cc-dim";
        const shadow = icon(dishKey(recipe.id));
        shadow.classList.add("cc-silhouette");
        line.append(
          shadow,
          labelled("???", `Section ${recipe.section} · ${recipe.ingredients.length} ingredients`),
        );
      } else {
        const best = entry.bestQuality ? QUALITY_MARK[entry.bestQuality] : "Common";
        line.append(
          icon(dishKey(recipe.id)),
          labelled(recipe.name, `Best: ${best} · cooked ${entry.cookedCount}x · ${recipe.sellCoins}c`),
        );
      }
      list.append(line);
    }
  });

  return modal;
}

// --- tavern ----------------------------------------------------------------

export function openTavern(callbacks: PanelCallbacks): ModalHandle {
  const modal = openModal("Tavern");
  const list = document.createElement("div");
  list.className = "cc-list";
  const summary = document.createElement("p");
  modal.body.append(summary, list);

  live(modal, (profile) => {
    summary.textContent = `The keeper buys any dish. You have ${profile.coins} coins.`;
    list.replaceChildren();

    const dishes = profile.inventory.filter((stack) => stack.kind === "dish");
    if (dishes.length === 0) {
      const empty = document.createElement("small");
      empty.textContent = "Nothing cooked to sell. The kitchen is across the plaza.";
      list.append(empty);
      return;
    }

    for (const stack of dishes) {
      const recipe = findRecipe(stack.id);
      const entry = row();
      entry.append(
        icon(dishKey(stack.id)),
        labelled(
          `${stack.qty} x ${stack.name}`,
          `about ${recipe?.sellCoins ?? "?"}c each before quality`,
        ),
      );

      const actions = document.createElement("div");
      actions.className = "cc-actions";
      actions.append(button("Sell 1", () => callbacks.onSell(stack.key, 1)));
      if (stack.qty > 1) {
        actions.append(button(`Sell all`, () => callbacks.onSell(stack.key, stack.qty)));
      }
      entry.append(actions);
      list.append(entry);
    }
  });

  return modal;
}

// --- outfitter -------------------------------------------------------------

export function openShop(callbacks: PanelCallbacks): ModalHandle {
  const modal = openModal("Outfitter");
  const list = document.createElement("div");
  list.className = "cc-list";
  const summary = document.createElement("p");
  modal.body.append(summary, list);

  live(modal, (profile) => {
    summary.textContent = `${profile.coins} coins`;
    list.replaceChildren();

    const nextPan = CONFIG.economy.pan.find((tier) => tier.tier === profile.panTier + 1);
    const nextBag = CONFIG.economy.bag.find((tier) => tier.tier === profile.bagTier + 1);

    const panEntry = row();
    if (nextPan) {
      const materials = nextPan.items
        .map((item) => `${item.qty} ${findIngredient(item.id)?.name ?? item.id}`)
        .join(", ");
      panEntry.append(
        labelled(
          nextPan.name,
          `+${nextPan.windowBonusPct}% timing window · ${nextPan.coins}c${materials ? ` + ${materials}` : ""}`,
        ),
      );
      panEntry.append(
        button("Buy", () => callbacks.onBuy("pan", nextPan.tier), profile.coins < nextPan.coins),
      );
    } else {
      panEntry.className = "cc-row cc-dim";
      panEntry.append(labelled("Iron pan", "The best pan in the valley is already yours."));
    }
    list.append(panEntry);

    const bagEntry = row();
    if (nextBag) {
      bagEntry.append(labelled(nextBag.name, `+${nextBag.slots} carry slots · ${nextBag.coins}c`));
      bagEntry.append(
        button("Buy", () => callbacks.onBuy("bag", nextBag.tier), profile.coins < nextBag.coins),
      );
    } else {
      bagEntry.className = "cc-row cc-dim";
      bagEntry.append(labelled("Packs", "Nothing larger to carry."));
    }
    list.append(bagEntry);
  });

  return modal;
}

// --- leaderboard -----------------------------------------------------------

/**
 * Top 20 by Chef Level, refetched every 60 seconds.
 *
 * Polled rather than pushed: it is public, changes slowly, and a socket message
 * per player per minute would cost far more than one cached GET.
 */
export function openLeaderboard(selfWallet: string): ModalHandle {
  const modal = openModal("Top chefs");
  const list = document.createElement("div");
  list.className = "cc-list";
  const summary = document.createElement("p");
  summary.textContent = "Loading…";
  modal.body.append(summary, list);

  const render = (payload: LeaderboardPayload) => {
    summary.textContent =
      payload.rows.length === 0
        ? "Nobody has cooked anything yet. Be first."
        : `Updated just now · refreshes every ${LEADERBOARD_POLL_MS / 1000}s`;

    list.replaceChildren();
    for (const entry of payload.rows) {
      const line = row();
      if (entry.wallet === selfWallet) line.style.borderColor = "#7ce08a";
      const titles = entry.titles.length > 0 ? ` · ${entry.titles.join(", ")}` : "";
      line.append(
        labelled(`${entry.rank}. ${entry.displayName}`, `Chef ${entry.chefLevel} · ${entry.chefXp} XP${titles}`),
      );
      list.append(line);
    }
  };

  const poll = () => {
    void fetchLeaderboard()
      .then(render)
      .catch((err: unknown) => {
        summary.textContent = `Could not reach the leaderboard: ${(err as Error).message}`;
      });
  };

  poll();
  const timer = window.setInterval(poll, LEADERBOARD_POLL_MS);
  modal.onClose(() => window.clearInterval(timer));
  return modal;
}

// --- dock ------------------------------------------------------------------

export interface DockActions {
  inventory(): void;
  skills(): void;
  codex(): void;
  leaderboard(): void;
  settings(): void;
}

/**
 * The always-present toolbar. Stations are walked to; these are things a
 * player checks constantly, so they get a button and a key each.
 */
export class Dock {
  private readonly element = document.createElement("div");
  private readonly onKey: (event: KeyboardEvent) => void;

  constructor(root: HTMLElement, actions: DockActions) {
    this.element.className = "cc-dock";

    const entries: [string, string, () => void][] = [
      ["Bag", "KeyB", actions.inventory],
      ["Skills", "KeyK", actions.skills],
      ["Codex", "KeyC", actions.codex],
      ["Top chefs", "KeyL", actions.leaderboard],
      ["Settings", "KeyO", actions.settings],
    ];

    /*
     * The keyboard hint is dropped on a device that has no keyboard. "Bag (B)"
     * is help on a desktop and a lie on a phone, and it is also what pushes
     * five buttons past the width of the screen.
     */
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;

    for (const [label, code, handler] of entries) {
      const element = document.createElement("button");
      element.textContent = coarse ? label : `${label} (${code.replace("Key", "")})`;
      element.addEventListener("click", handler);
      this.element.append(element);
    }

    this.onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const match = entries.find(([, code]) => code === event.code);
      if (!match) return;
      event.preventDefault();
      match[2]();
    };
    window.addEventListener("keydown", this.onKey);

    root.append(this.element);
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.element.remove();
  }
}

/** Shown when a station panel is opened from too far away. */
export function tooFar(name: string) {
  toast(`Walk over to the ${name} first.`, "bad");
}

// --- settings --------------------------------------------------------------

/**
 * Volume, and nothing else yet.
 *
 * The sliders work whether or not any audio exists: with no files in place the
 * UI cues fall back to a synthesised tone and the ambient beds stay silent, so
 * turning the ambient channel down still does exactly what it says.
 */
export function openSettings(): ModalHandle {
  const modal = openModal("Settings");

  const note = document.createElement("p");
  note.textContent = "Volume is remembered on this device.";
  modal.body.append(note);

  const rows: [Channel, string][] = [
    ["master", "Overall"],
    ["ambient", "Ambience"],
    ["effects", "Effects"],
  ];

  for (const [channel, label] of rows) {
    const row = document.createElement("label");
    row.className = "cc-slider";

    const name = document.createElement("span");
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.step = "5";
    input.value = String(Math.round(sound.levels[channel] * 100));

    const readout = document.createElement("small");
    readout.textContent = `${input.value}%`;

    input.addEventListener("input", () => {
      const value = Number(input.value) / 100;
      sound.setVolume(channel, value);
      readout.textContent = `${input.value}%`;
    });
    // A cue on release, so the slider demonstrates what it just changed.
    input.addEventListener("change", () => sound.play("panel"));

    row.append(name, input, readout);
    modal.body.append(row);
  }

  return modal;
}

// --- wardrobe --------------------------------------------------------------

const TIER_LABEL: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

/**
 * The Outfitter's wardrobe: two rows, hats and aprons.
 *
 * Unlocked items are in colour and clickable; locked ones are greyed with the
 * condition that earns them, taken from the content rather than written here.
 * Tier items carry a badge and stop being wearable the moment the balance stops
 * backing them - the server enforces that, this only shows it.
 */
export function openWardrobe(onEquip: (kind: "hat" | "apron", itemId: string) => void): ModalHandle {
  const modal = openModal("Wardrobe");
  const summary = document.createElement("p");
  const rows = document.createElement("div");
  modal.body.append(summary, rows);

  live(modal, (profile) => {
    summary.textContent = profile.tier
      ? `Holder tier: ${TIER_LABEL[profile.tier] ?? profile.tier}`
      : "No holder tier. Tier garments need a $COOK balance.";

    rows.replaceChildren();

    for (const kind of ["hat", "apron"] as const) {
      const heading = document.createElement("h3");
      heading.textContent = kind === "hat" ? "Hats" : "Aprons";
      heading.className = "cc-subhead";

      const grid = document.createElement("div");
      grid.className = "cc-grid";

      const equippedId = kind === "hat" ? profile.hatId : profile.apronId;

      // An explicit "none" so a hat can be taken off again.
      grid.append(
        wardrobeSlot(
          { id: "", kind, name: "None", unlocked: true, equipped: equippedId === "", requirement: "" },
          () => onEquip(kind, ""),
        ),
      );

      for (const item of profile.wardrobe.filter((i) => i.kind === kind)) {
        grid.append(wardrobeSlot(item, () => onEquip(kind, item.id)));
      }

      rows.append(heading, grid);
    }
  });

  return modal;
}

function wardrobeSlot(
  item: {
    id: string;
    kind: "hat" | "apron";
    name: string;
    unlocked: boolean;
    equipped: boolean;
    requirement: string;
    tier?: string;
    tierLapsed?: boolean;
  },
  onClick: () => void,
): HTMLElement {
  const cell = document.createElement("button");
  cell.className = "cc-slot";
  if (!item.unlocked) cell.classList.add("cc-locked");
  if (item.equipped) cell.classList.add("cc-equipped");
  cell.disabled = !item.unlocked;

  if (item.id) cell.append(wardrobePreview(item.kind, item.id));

  const name = document.createElement("strong");
  name.textContent = item.name;

  const note = document.createElement("small");
  note.textContent = item.tierLapsed
    ? "Balance lapsed"
    : item.unlocked
      ? item.equipped
        ? "Worn"
        : "Ready"
      : item.requirement;

  cell.append(name, note);

  if (item.tier) {
    const badge = document.createElement("i");
    badge.className = `cc-badge cc-${item.tier}`;
    badge.textContent = TIER_LABEL[item.tier] ?? item.tier;
    cell.append(badge);
  }

  cell.addEventListener("click", onClick);
  return cell;
}
