/**
 * The cooking mini-game: recipe list, prep hold, heat bar.
 *
 * The bar is drawn from the numbers the server sent and nothing else. When the
 * player clicks, the client reports *how long after the bar arrived* the click
 * happened and lets the server decide the rest - it never computes a quality,
 * so there is nothing here worth tampering with.
 */

import {
  RECIPES,
  findIngredient,
  type CookPreparedPayload,
  type CookResultPayload,
  type HeatBarPayload,
  type ProfilePayload,
  type Recipe,
} from "@crazycauldron/shared";
import { gameStore } from "../net/game.js";
import { openModal, type ModalHandle } from "./overlay.js";

export interface KitchenCallbacks {
  onCook(recipeId: string): void;
  onPrepDone(cookId: string): void;
  onStop(cookId: string, elapsedMs: number): void;
  onCancel(): void;
}

function ingredientLine(recipe: Recipe): string {
  return recipe.ingredients
    .map((item) => {
      const name = findIngredient(item.id)?.name ?? item.id;
      const held = gameStore.countIngredient(item.id);
      return `${name} ${held}/${item.qty}`;
    })
    .join(", ");
}

/**
 * The kitchen. Cookable recipes sit at the top; the rest show exactly what is
 * missing, since "needs Knifework 7" is the only useful thing to say about a
 * recipe a player cannot cook yet.
 */
export function openKitchen(callbacks: KitchenCallbacks): ModalHandle {
  const modal = openModal("Kitchen");
  const profile = gameStore.profile;

  const list = document.createElement("div");
  list.className = "cc-list";

  const availability = new Map(
    (profile?.recipes ?? []).map((entry) => [entry.recipeId, entry] as const),
  );

  const sorted = [...RECIPES].sort((a, b) => {
    const aOk = availability.get(a.id)?.cookable ? 0 : 1;
    const bOk = availability.get(b.id)?.cookable ? 0 : 1;
    return aOk - bOk || a.section - b.section || a.chefXp - b.chefXp;
  });

  for (const recipe of sorted) {
    const entry = availability.get(recipe.id);
    const cookable = entry?.cookable ?? false;

    const row = document.createElement("div");
    row.className = cookable ? "cc-row" : "cc-row cc-dim";

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = recipe.name;

    const detail = document.createElement("small");
    detail.textContent = cookable
      ? `${ingredientLine(recipe)} · ${recipe.technique} · ${recipe.chefXp} XP · ${recipe.sellCoins}c`
      : (entry?.reasons.join(" · ") ?? "Locked");

    text.append(title, document.createElement("br"), detail);

    const button = document.createElement("button");
    button.className = "cc-btn";
    button.textContent = "Cook";
    button.disabled = !cookable;
    button.addEventListener("click", () => {
      modal.close();
      callbacks.onCook(recipe.id);
    });

    row.append(text, button);
    list.append(row);
  }

  modal.body.append(list);
  return modal;
}

/**
 * The prep hold. The player holds the button for the full 1.5s; letting go
 * early cancels, which is what makes it a step rather than a delay.
 */
export function runPrep(payload: CookPreparedPayload, callbacks: KitchenCallbacks): ModalHandle {
  const recipe = RECIPES.find((r) => r.id === payload.recipeId);
  const modal = openModal(`Prep: ${recipe?.name ?? payload.recipeId}`, "cc-cook");
  let done = false;

  const hint = document.createElement("p");
  hint.textContent = "Hold to prep the ingredients.";

  const bar = document.createElement("div");
  bar.className = "cc-progress cc-inline";
  const fill = document.createElement("i");
  bar.append(fill);

  const hold = document.createElement("button");
  hold.className = "cc-btn";
  hold.textContent = "Hold to prep";

  let frame = 0;
  let startedAt = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    if (!done) fill.style.width = "0%";
  };

  const tick = () => {
    const fraction = Math.min((performance.now() - startedAt) / payload.prepMs, 1);
    fill.style.width = `${fraction * 100}%`;
    if (fraction >= 1) {
      done = true;
      hold.disabled = true;
      hold.textContent = "Prepped";
      callbacks.onPrepDone(payload.cookId);
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  hold.addEventListener("pointerdown", () => {
    if (done) return;
    startedAt = performance.now();
    frame = requestAnimationFrame(tick);
  });
  hold.addEventListener("pointerup", stop);
  hold.addEventListener("pointerleave", stop);

  modal.body.append(hint, bar, hold);
  modal.onClose(() => {
    cancelAnimationFrame(frame);
    if (!done) callbacks.onCancel();
  });
  return modal;
}

/**
 * The heat bar. The marker is a triangle wave over the elapsed time - exactly
 * the arithmetic the server runs in reverse when it receives the click.
 */
export function runHeatBar(payload: HeatBarPayload, callbacks: KitchenCallbacks): ModalHandle {
  const recipe = RECIPES.find((r) => r.id === payload.recipeId);
  const modal = openModal(`Cooking: ${recipe?.name ?? payload.recipeId}`, "cc-cook");

  const hint = document.createElement("p");
  hint.textContent = "Click to stop the marker in the window.";

  const track = document.createElement("div");
  track.className = "cc-heat";

  // The Fine band sits behind the Superb band, both centred on the target.
  const fine = document.createElement("i");
  fine.className = "cc-heat-fine";
  fine.style.left = `${(payload.windowCentre - payload.fineWindowPct / 200) * 100}%`;
  fine.style.width = `${payload.fineWindowPct}%`;

  const superb = document.createElement("i");
  superb.className = "cc-heat-superb";
  superb.style.left = `${(payload.windowCentre - payload.windowPct / 200) * 100}%`;
  superb.style.width = `${payload.windowPct}%`;

  const marker = document.createElement("b");
  marker.className = "cc-heat-marker";

  track.append(fine, superb, marker);

  const stopButton = document.createElement("button");
  stopButton.className = "cc-btn";
  stopButton.textContent = "Stop";

  const startedAt = performance.now();
  let frame = 0;
  let stopped = false;

  const positionAt = (elapsedMs: number) => {
    const travelled = payload.startOffset + payload.direction * payload.speed * elapsedMs;
    const cycle = ((travelled % 2) + 2) % 2;
    return cycle <= 1 ? cycle : 2 - cycle;
  };

  const tick = () => {
    const elapsed = Math.min(performance.now() - startedAt, payload.durationMs);
    marker.style.left = `${positionAt(elapsed) * 100}%`;
    if (elapsed >= payload.durationMs) {
      // Out of time: the server settles it at the end of the bar either way.
      stopped = true;
      stopButton.disabled = true;
      hint.textContent = "Out of time.";
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    stopButton.disabled = true;

    const elapsed = Math.min(performance.now() - startedAt, payload.durationMs);
    marker.style.left = `${positionAt(elapsed) * 100}%`;
    hint.textContent = "Cooking…";
    callbacks.onStop(payload.cookId, Math.round(elapsed));
  };

  stopButton.addEventListener("click", stop);
  track.addEventListener("click", stop);
  // Space bar works too; the mini-game is a timing test, not a mousing test.
  const onKey = (event: KeyboardEvent) => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      stop();
    }
  };
  window.addEventListener("keydown", onKey);

  modal.body.append(hint, track, stopButton);
  modal.onClose(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener("keydown", onKey);
    if (!stopped) callbacks.onCancel();
  });
  return modal;
}

const QUALITY_BLURB: Record<string, string> = {
  common: "Edible.",
  fine: "Nicely done.",
  superb: "A perfect plate.",
};

export function showCookResult(result: CookResultPayload, profile: ProfilePayload | null): ModalHandle {
  const recipe = RECIPES.find((r) => r.id === result.recipeId);
  const modal = openModal(`${recipe?.name ?? result.recipeId} - ${result.quality}`, "cc-cook");

  const blurb = document.createElement("p");
  blurb.textContent = QUALITY_BLURB[result.quality] ?? "";

  const xp = document.createElement("p");
  xp.textContent = `+${result.chefXp} Chef XP · ${result.skillXp
    .map((award) => `+${award.xp} ${award.skill}`)
    .join(" · ")}`;

  const note = document.createElement("p");
  note.className = "cc-error";
  if (result.downgraded) note.textContent = "The spice got away from you - one step down.";
  else if (result.upgraded) note.textContent = "Your spicecraft lifted it a step.";
  note.hidden = !result.downgraded && !result.upgraded;

  const coins = document.createElement("small");
  coins.textContent = profile ? `${profile.coins} coins · Chef ${profile.chefLevel}` : "";

  modal.body.append(blurb, xp, note, coins);
  window.setTimeout(() => modal.close(), 3500);
  return modal;
}
