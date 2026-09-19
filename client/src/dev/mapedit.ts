/**
 * The map editor, served at /dev/mapedit in development only.
 *
 * scripts/build-areas.ts produces a first pass by looking at each painting:
 * the open regions and the big structures are placed by hand in
 * scripts/area-layout.json, and the shrubs, puddles and boulder piles come out
 * of the pixels. It is a first pass and no more - a classifier cannot tell a
 * dark patch of grass from a dark patch of bramble, and only a person looking
 * at the picture can say which cells a player should be able to stand on.
 *
 * So this shows the painting with its grid over it and lets that person fix
 * it: paint walkable, paint blocked, move the spawn, drop a gate or a counter
 * or a gather node, and save. Saves go to shared/src/content/maps/<area>.json,
 * which is the same file the generator writes - so a correction survives until
 * somebody re-runs the generator, and the file says so at the top.
 *
 * Deliberately plain DOM and canvas: it is a workbench, not a screen.
 */

import {
  AREAS,
  SECTIONS,
  type AreaFile,
  type AreaNode,
  type AreaZone,
  type ZoneKind,
} from "@crazycauldron/shared";

/** How big one cell is drawn. The paintings are 42x24, so this fits a laptop. */
const CELL_PX = 26;

type Tool = "walk" | "spawn" | "building" | "portal" | "scenery" | "node" | "erase";

const TOOLS: { id: Tool; key: string; label: string; help: string }[] = [
  { id: "walk", key: "1", label: "Walkable", help: "left-click paints open ground, right-click blocks it" },
  { id: "spawn", key: "2", label: "Spawn", help: "click where players arrive" },
  { id: "building", key: "3", label: "Building", help: "drag a rectangle over a painted shop front" },
  { id: "portal", key: "4", label: "Gate", help: "drag a rectangle over a path leading off the map" },
  { id: "scenery", key: "5", label: "Scenery", help: "drag over something players should walk behind" },
  { id: "node", key: "6", label: "Node", help: "click to place the next unplaced gather node" },
  { id: "erase", key: "7", label: "Erase", help: "click a zone or node to remove it" },
];

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${src}`));
    image.src = src;
  });

/** A deep copy, so Cancel is a real option and Save is a deliberate act. */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

class MapEditor {
  private areas: AreaFile[] = AREAS.map(clone);
  private area: AreaFile = this.areas[0]!;
  private paintings = new Map<string, HTMLImageElement>();

  private tool: Tool = "walk";
  private painting: "open" | "block" | null = null;
  private dragFrom: { c: number; r: number } | null = null;
  private dragTo: { c: number; r: number } | null = null;
  private hover: { c: number; r: number } | null = null;
  private dirty = false;

  private readonly canvas = document.createElement("canvas");
  private readonly status = document.createElement("div");
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();

  async start(root: HTMLElement) {
    for (const area of this.areas) {
      try {
        this.paintings.set(area.id, await loadImage(`/assets/maps/${area.image}`));
      } catch {
        // An area with no painting can still have its grid edited.
      }
    }
    this.build(root);
    this.bind();
    this.draw();
  }

  // --- the grid --------------------------------------------------------------

  private walkableAt(c: number, r: number): boolean {
    return this.area.walkable[r]?.[c] === ".";
  }

  private setWalkable(c: number, r: number, open: boolean) {
    if (c < 0 || r < 0 || c >= this.area.cols || r >= this.area.rows) return;
    const row = this.area.walkable[r];
    if (!row) return;
    const want = open ? "." : "#";
    if (row[c] === want) return;
    this.area.walkable[r] = row.slice(0, c) + want + row.slice(c + 1);
    this.dirty = true;
  }

  private cellAt(event: PointerEvent): { c: number; r: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const c = Math.floor(((event.clientX - rect.left) * scaleX) / CELL_PX);
    const r = Math.floor(((event.clientY - rect.top) * scaleY) / CELL_PX);
    if (c < 0 || r < 0 || c >= this.area.cols || r >= this.area.rows) return null;
    return { c, r };
  }

  // --- what a click means ----------------------------------------------------

  private onDown(event: PointerEvent) {
    const cell = this.cellAt(event);
    if (!cell) return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);

    if (this.tool === "walk") {
      this.painting = event.button === 2 ? "block" : "open";
      this.setWalkable(cell.c, cell.r, this.painting === "open");
      this.draw();
      return;
    }

    if (this.tool === "spawn") {
      this.area.spawn = { col: cell.c, row: cell.r };
      // A spawn has to be somewhere a player can stand, so opening the cell is
      // part of placing it rather than a second thing to remember.
      this.setWalkable(cell.c, cell.r, true);
      this.dirty = true;
      this.say(`spawn moved to ${cell.c},${cell.r}`);
      this.draw();
      return;
    }

    if (this.tool === "node") {
      this.placeNode(cell);
      this.draw();
      return;
    }

    if (this.tool === "erase") {
      this.eraseAt(cell);
      this.draw();
      return;
    }

    this.dragFrom = cell;
    this.dragTo = cell;
    this.draw();
  }

  private onMove(event: PointerEvent) {
    const cell = this.cellAt(event);
    this.hover = cell;

    if (cell && this.painting && this.tool === "walk") {
      this.setWalkable(cell.c, cell.r, this.painting === "open");
    }
    if (cell && this.dragFrom) this.dragTo = cell;
    this.draw();
  }

  private onUp() {
    if (this.dragFrom && this.dragTo) {
      const kind = this.tool as ZoneKind;
      if (kind === "building" || kind === "portal" || kind === "scenery") {
        this.placeZone(kind, this.dragFrom, this.dragTo);
      }
    }
    this.painting = null;
    this.dragFrom = null;
    this.dragTo = null;
    this.draw();
  }

  /**
   * Adds a zone over the dragged rectangle.
   *
   * A building or a gate is also an obstacle - the painting shows a solid
   * thing - so its footprint is blocked in the same move. Forgetting that is
   * how a player ends up standing inside a tavern.
   */
  private placeZone(kind: ZoneKind, from: { c: number; r: number }, to: { c: number; r: number }) {
    const c = Math.min(from.c, to.c);
    const r = Math.min(from.r, to.r);
    const w = Math.abs(to.c - from.c) + 1;
    const h = Math.abs(to.r - from.r) + 1;

    const id = this.nextZoneId(kind);
    if (!id) return;

    const zone: AreaZone = {
      kind,
      id,
      name: this.nameFor(kind, id),
      c,
      r,
      w,
      h,
      // The front edge of a painted structure, which is what decides whether a
      // player draws in front of it or behind it.
      baseline: r + h - 1,
      ...(kind === "portal" ? { section: this.sectionFor(id), glow: "#7ce08a" } : {}),
    };

    this.area.zones = this.area.zones.filter((z) => z.id !== id);
    this.area.zones.push(zone);

    if (kind !== "scenery") {
      for (let y = r; y < r + h; y += 1) for (let x = c; x < c + w; x += 1) {
        if (kind === "building") this.setWalkable(x, y, false);
      }
    }
    this.dirty = true;
    this.say(`${kind} "${id}" at ${c},${r} ${w}x${h}`);
  }

  /** The next id this area still needs, or null when it has them all. */
  private nextZoneId(kind: ZoneKind): string | null {
    const taken = new Set(this.area.zones.map((z) => z.id));

    if (kind === "building") {
      const wanted = ["kitchen", "tavern", "outfitter"].filter((id) => !taken.has(id));
      if (wanted.length === 0) {
        this.say("the hub already has all three counters - erase one first");
        return null;
      }
      return wanted[0]!;
    }

    if (kind === "portal") {
      if (this.area.map === 0) {
        const wanted = SECTIONS.map((s) => `portal_${s.index}`).filter((id) => !taken.has(id));
        if (wanted.length === 0) {
          this.say("every gate is already placed - erase one first");
          return null;
        }
        return wanted[0]!;
      }
      return "portal_hub";
    }

    let n = 1;
    while (taken.has(`scenery_${n}`)) n += 1;
    return `scenery_${n}`;
  }

  private nameFor(kind: ZoneKind, id: string): string {
    if (kind === "scenery") return "";
    if (id === "portal_hub") return "Back to the hub";
    const section = SECTIONS.find((s) => `portal_${s.index}` === id);
    if (section) return section.name;
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  private sectionFor(id: string): number {
    if (id === "portal_hub") return 0;
    return Number(id.replace("portal_", "")) || 0;
  }

  /** Places the next gather node this section is missing. */
  private placeNode(cell: { c: number; r: number }) {
    const section = SECTIONS.find((s) => s.index === this.area.map);
    if (!section) {
      this.say("the hub has no gather nodes");
      return;
    }
    const placed = new Set(this.area.nodes.map((n) => n.id));
    const next = section.nodes.find((n) => !placed.has(n.id));
    if (!next) {
      this.say("every node in this section is placed - erase one to move it");
      return;
    }

    const node: AreaNode = { id: next.id, c: cell.c, r: cell.r };
    this.area.nodes.push(node);
    this.setWalkable(cell.c, cell.r, true);
    this.dirty = true;
    this.say(`${next.id} (${next.ingredient}) at ${cell.c},${cell.r}`);
  }

  private eraseAt(cell: { c: number; r: number }) {
    const node = this.area.nodes.find((n) => n.c === cell.c && n.r === cell.r);
    if (node) {
      this.area.nodes = this.area.nodes.filter((n) => n.id !== node.id);
      this.dirty = true;
      this.say(`removed node ${node.id}`);
      return;
    }

    const zone = this.area.zones.find(
      (z) => cell.c >= z.c && cell.c < z.c + z.w && cell.r >= z.r && cell.r < z.r + z.h,
    );
    if (zone) {
      this.area.zones = this.area.zones.filter((z) => z.id !== zone.id);
      this.dirty = true;
      this.say(`removed ${zone.kind} ${zone.id}`);
      return;
    }
    this.say("nothing to erase there");
  }

  // --- drawing ---------------------------------------------------------------

  private draw() {
    const context = this.canvas.getContext("2d");
    if (!context) return;

    this.canvas.width = this.area.cols * CELL_PX;
    this.canvas.height = this.area.rows * CELL_PX;
    context.imageSmoothingEnabled = false;

    const painting = this.paintings.get(this.area.id);
    if (painting) {
      context.drawImage(painting, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      context.fillStyle = "#1d1728";
      context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Blocked cells: a red wash, sparse enough to see the paint through it.
    context.fillStyle = "rgba(255, 50, 50, 0.42)";
    for (let r = 0; r < this.area.rows; r += 1) {
      for (let c = 0; c < this.area.cols; c += 1) {
        if (!this.walkableAt(c, r)) context.fillRect(c * CELL_PX, r * CELL_PX, CELL_PX, CELL_PX);
      }
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.12)";
    context.lineWidth = 1;
    for (let c = 0; c <= this.area.cols; c += 1) {
      context.beginPath();
      context.moveTo(c * CELL_PX + 0.5, 0);
      context.lineTo(c * CELL_PX + 0.5, this.canvas.height);
      context.stroke();
    }
    for (let r = 0; r <= this.area.rows; r += 1) {
      context.beginPath();
      context.moveTo(0, r * CELL_PX + 0.5);
      context.lineTo(this.canvas.width, r * CELL_PX + 0.5);
      context.stroke();
    }

    for (const zone of this.area.zones) {
      const colour =
        zone.kind === "portal" ? "#50c8ff" : zone.kind === "building" ? "#ffdc50" : "#c878ff";
      context.strokeStyle = colour;
      context.lineWidth = 2;
      context.strokeRect(
        zone.c * CELL_PX + 1,
        zone.r * CELL_PX + 1,
        zone.w * CELL_PX - 2,
        zone.h * CELL_PX - 2,
      );
      // The baseline, drawn solid: it is the row that decides front from back.
      context.beginPath();
      context.moveTo(zone.c * CELL_PX, (zone.baseline + 1) * CELL_PX - 1);
      context.lineTo((zone.c + zone.w) * CELL_PX, (zone.baseline + 1) * CELL_PX - 1);
      context.stroke();

      context.fillStyle = colour;
      context.font = "10px ui-monospace, monospace";
      context.fillText(zone.id, zone.c * CELL_PX + 3, zone.r * CELL_PX + 11);
    }

    for (const node of this.area.nodes) {
      context.fillStyle = "rgba(120, 255, 120, 0.85)";
      context.fillRect(node.c * CELL_PX + 6, node.r * CELL_PX + 6, CELL_PX - 12, CELL_PX - 12);
    }

    context.fillStyle = "rgba(255, 255, 255, 0.8)";
    context.fillRect(
      this.area.spawn.col * CELL_PX + 4,
      this.area.spawn.row * CELL_PX + 4,
      CELL_PX - 8,
      CELL_PX - 8,
    );

    if (this.dragFrom && this.dragTo) {
      const c = Math.min(this.dragFrom.c, this.dragTo.c);
      const r = Math.min(this.dragFrom.r, this.dragTo.r);
      const w = Math.abs(this.dragTo.c - this.dragFrom.c) + 1;
      const h = Math.abs(this.dragTo.r - this.dragFrom.r) + 1;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1;
      context.setLineDash([4, 3]);
      context.strokeRect(c * CELL_PX, r * CELL_PX, w * CELL_PX, h * CELL_PX);
      context.setLineDash([]);
    }

    this.renderStatus();
  }

  private renderStatus() {
    const walkable = this.area.walkable.join("").split("").filter((ch) => ch === ".").length;
    const section = SECTIONS.find((s) => s.index === this.area.map);
    const missing = section
      ? section.nodes.filter((n) => !this.area.nodes.some((p) => p.id === n.id))
      : [];

    const at = this.hover ? `${this.hover.c},${this.hover.r}` : "-";
    const tool = TOOLS.find((t) => t.id === this.tool);

    this.status.textContent =
      `${this.area.name} - ${walkable} walkable of ${this.area.cols * this.area.rows} cells, ` +
      `${this.area.zones.length} zone(s), ${this.area.nodes.length} node(s)` +
      (missing.length > 0 ? `, ${missing.length} still to place: ${missing[0]!.id}` : "") +
      `\ncursor ${at} - ${tool?.label}: ${tool?.help}` +
      (this.dirty ? "\nunsaved changes" : "");
  }

  private say(message: string) {
    this.status.textContent = message;
  }

  // --- chrome ----------------------------------------------------------------

  private build(root: HTMLElement) {
    root.replaceChildren();

    const title = document.createElement("h1");
    title.textContent = "Map editor";

    const help = document.createElement("p");
    help.innerHTML =
      "The generator's first pass comes from looking at the painting, which cannot tell dark grass " +
      "from dark bramble. Correct it here. <kbd>1</kbd>-<kbd>7</kbd> switch tools, " +
      "<kbd>left-drag</kbd> paints walkable and <kbd>right-drag</kbd> blocks, and zones are dragged " +
      "as rectangles. Saving writes shared/src/content/maps/&lt;area&gt;.json - the same file " +
      "<code>npm run areas</code> writes, so re-running it discards what you do here.";

    const controls = document.createElement("div");
    controls.className = "row";

    const picker = document.createElement("select");
    for (const area of this.areas) {
      const option = document.createElement("option");
      option.value = area.id;
      option.textContent = `${area.name} (map ${area.map})`;
      picker.append(option);
    }
    picker.addEventListener("change", () => {
      if (this.dirty && !window.confirm("Discard unsaved changes to this map?")) {
        picker.value = this.area.id;
        return;
      }
      this.area = this.areas.find((a) => a.id === picker.value) ?? this.areas[0]!;
      this.dirty = false;
      this.draw();
    });

    const areaLabel = document.createElement("label");
    areaLabel.textContent = "Map ";
    areaLabel.append(picker);
    controls.append(areaLabel);

    for (const tool of TOOLS) {
      const button = document.createElement("button");
      button.textContent = `${tool.label} (${tool.key})`;
      button.addEventListener("click", () => this.selectTool(tool.id));
      this.toolButtons.set(tool.id, button);
      controls.append(button);
    }

    const actions = document.createElement("div");
    actions.className = "row";

    const save = document.createElement("button");
    save.textContent = "Save this map";
    save.addEventListener("click", () => void this.save(save));

    const revert = document.createElement("button");
    revert.textContent = "Revert";
    revert.addEventListener("click", () => {
      const original = AREAS.find((a) => a.id === this.area.id);
      if (!original) return;
      const at = this.areas.indexOf(this.area);
      this.area = clone(original);
      this.areas[at] = this.area;
      this.dirty = false;
      this.say("reverted to what is on disk");
      this.draw();
    });

    const check = document.createElement("button");
    check.textContent = "Check layout";
    check.addEventListener("click", () => this.check());

    actions.append(save, revert, check);

    const legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML =
      '<span><i class="swatch" style="background:#ff3232"></i>blocked</span>' +
      '<span><i class="swatch" style="background:#ffdc50"></i>building</span>' +
      '<span><i class="swatch" style="background:#50c8ff"></i>gate</span>' +
      '<span><i class="swatch" style="background:#c878ff"></i>scenery</span>' +
      '<span><i class="swatch" style="background:#78ff78"></i>node</span>' +
      '<span><i class="swatch" style="background:#ffffff"></i>spawn</span>' +
      "<span>the solid line across a zone is its baseline</span>";

    this.status.className = "status";
    this.status.style.whiteSpace = "pre-line";

    root.append(title, help, controls, this.canvas, this.status, actions, legend);
    this.selectTool("walk");
  }

  private selectTool(tool: Tool) {
    this.tool = tool;
    for (const [id, button] of this.toolButtons) button.classList.toggle("on", id === tool);
    this.draw();
  }

  private bind() {
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("pointerdown", (event) => this.onDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onMove(event));
    this.canvas.addEventListener("pointerup", () => this.onUp());
    this.canvas.addEventListener("pointercancel", () => this.onUp());

    window.addEventListener("keydown", (event) => {
      const tool = TOOLS.find((t) => t.key === event.key);
      if (tool) {
        this.selectTool(tool.id);
        event.preventDefault();
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!this.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  /**
   * Runs the same checks the server runs at startup, against what is on
   * screen rather than what is on disk - so a mistake is caught here rather
   * than by a deploy that will not boot.
   */
  private async check() {
    try {
      const response = await fetch("/dev/area/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.area),
      });
      const result = (await response.json()) as { ok: boolean; problems?: string[] };
      this.status.textContent =
        result.ok && (result.problems?.length ?? 0) === 0
          ? "layout: OK"
          : `layout: ${result.problems?.length ?? 0} problem(s)\n${(result.problems ?? []).join("\n")}`;
    } catch (err) {
      this.say(`could not check: ${(err as Error).message}`);
    }
  }

  private async save(button: HTMLButtonElement) {
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const response = await fetch("/dev/area", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.area),
      });
      const result = (await response.json()) as { ok: boolean; wrote?: string; error?: string };
      if (!result.ok) throw new Error(result.error ?? `${response.status}`);
      this.dirty = false;
      button.textContent = "Saved";
      this.say(`wrote ${result.wrote}`);
    } catch (err) {
      button.textContent = `Failed: ${(err as Error).message}`;
    }
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Save this map";
    }, 1600);
  }
}

const root = document.getElementById("app");
if (root) void new MapEditor().start(root);
