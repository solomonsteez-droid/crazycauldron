/**
 * The overlay alignment tool, served at /dev/align in development only.
 *
 * The pipeline guesses where each hat and cloak sits on the body. That guess is
 * close but never right to the pixel, and a hat one pixel low reads as wrong
 * immediately. This shows the composite at 4x, lets the arrow keys nudge the
 * selected garment, and writes the result to
 * client/public/assets/generated/offsets.json, which the game reads at load.
 *
 * Deliberately plain DOM and canvas: it is a workbench, not a screen.
 */

import {
  DIRECTIONS,
  GENERATED,
  defaultOffsets,
  loadArt,
  type Direction,
  type ItemOffsets,
  type Manifest,
  type OffsetsFile,
  type OverlayEntry,
} from "../art/manifest.js";

const ZOOM = 4;
const BODIES = ["male", "female"] as const;

interface Atlas {
  image: HTMLImageElement;
  frames: Map<string, { x: number; y: number; w: number; h: number }>;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${src}`));
    image.src = src;
  });

async function loadAtlas(body: string): Promise<Atlas | null> {
  try {
    const [image, json] = await Promise.all([
      loadImage(`${GENERATED}/characters/${body}.png`),
      fetch(`${GENERATED}/characters/${body}.json`).then((r) => r.json()),
    ]);
    const frames = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const frame of (json as { frames: { filename: string; frame: never }[] }).frames) {
      frames.set(frame.filename, frame.frame);
    }
    return { image, frames };
  } catch {
    return null;
  }
}

class AlignTool {
  private manifest!: Manifest;
  private offsets!: OffsetsFile;
  private readonly atlases = new Map<string, Atlas>();
  private readonly overlayImages = new Map<string, HTMLImageElement>();

  private body: string = "male";
  private direction: Direction = "down";
  private hatId = "";
  private cloakId = "";
  private selected: "hats" | "cloaks" = "hats";
  private walkFrame = 0;

  private readonly canvas = document.createElement("canvas");
  private readonly status = document.createElement("p");

  /*
   * Erasing works on a canvas per overlay, not on the loaded image: the image
   * element is the pristine copy, so a right-drag has something to restore
   * from. Nothing is written to disk until Save.
   */
  private readonly edits = new Map<string, HTMLCanvasElement>();
  private brush = false;
  private brushSize = 2;
  private painting: "erase" | "restore" | null = null;
  private dirty = new Set<string>();

  async start(root: HTMLElement) {
    const art = await loadArt();
    this.manifest = art.manifest;
    this.offsets = art.offsets;

    for (const body of BODIES) {
      const atlas = await loadAtlas(body);
      if (atlas) this.atlases.set(body, atlas);
    }
    for (const kind of ["hats", "cloaks"] as const) {
      for (const entry of this.manifest[kind]) {
        try {
          this.overlayImages.set(
            `${kind}/${entry.id}`,
            await loadImage(`${GENERATED}/${kind}/${entry.id}.png`),
          );
        } catch {
          // A missing overlay just cannot be previewed; the rest still work.
        }
      }
    }

    this.hatId = this.manifest.hats[0]?.id ?? "";
    this.cloakId = this.manifest.cloaks[0]?.id ?? "";

    this.build(root);
    this.bindKeys();
    this.draw();
  }

  // --- offsets ------------------------------------------------------------

  private entry(kind: "hats" | "cloaks", id: string): OverlayEntry | undefined {
    return this.manifest[kind].find((e) => e.id === id);
  }

  private current(kind: "hats" | "cloaks", id: string): ItemOffsets {
    const existing = this.offsets[kind][id];
    if (existing) return existing;
    const fresh = defaultOffsets(this.entry(kind, id));
    this.offsets[kind][id] = fresh;
    return fresh;
  }

  private nudge(dx: number, dy: number) {
    const id = this.selected === "hats" ? this.hatId : this.cloakId;
    if (!id) return;
    const offsets = this.current(this.selected, id);
    const point = offsets[this.direction];
    point.x += dx;
    point.y += dy;
    this.draw();
  }

  // --- erasing ------------------------------------------------------------

  /** The editable copy of an overlay, created from the pristine image once. */
  private surface(kind: "hats" | "cloaks", id: string): HTMLCanvasElement | null {
    const key = `${kind}/${id}`;
    const existing = this.edits.get(key);
    if (existing) return existing;

    const image = this.overlayImages.get(key);
    if (!image) return null;

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    this.edits.set(key, canvas);
    return canvas;
  }

  /** Erases or restores a square of pixels around one overlay pixel. */
  private paintAt(clientX: number, clientY: number) {
    if (!this.painting) return;
    const id = this.selected === "hats" ? this.hatId : this.cloakId;
    if (!id) return;

    const surface = this.surface(this.selected, id);
    const context = surface?.getContext("2d");
    const pristine = this.overlayImages.get(`${this.selected}/${id}`);
    if (!surface || !context || !pristine) return;

    const rect = this.canvas.getBoundingClientRect();
    // The canvas is CSS-scaled, so pointer coordinates go through its own
    // scale before the 4x zoom and the overlay's offset are undone.
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const pad = 24;
    const point = this.current(this.selected, id)[this.direction];

    const x = Math.floor(((clientX - rect.left) * scaleX) / ZOOM) - pad - point.x;
    const y = Math.floor(((clientY - rect.top) * scaleY) / ZOOM) - pad - point.y;

    const half = Math.floor(this.brushSize / 2);
    const left = x - half;
    const top = y - half;

    if (this.painting === "erase") {
      context.clearRect(left, top, this.brushSize, this.brushSize);
    } else {
      context.save();
      context.imageSmoothingEnabled = false;
      context.clearRect(left, top, this.brushSize, this.brushSize);
      context.drawImage(
        pristine,
        left,
        top,
        this.brushSize,
        this.brushSize,
        left,
        top,
        this.brushSize,
        this.brushSize,
      );
      context.restore();
    }

    this.dirty.add(`${this.selected}/${id}`);
    this.draw();
  }

  private bindBrush() {
    this.canvas.addEventListener("contextmenu", (event) => {
      if (this.brush) event.preventDefault();
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.brush) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.painting = event.button === 2 ? "restore" : "erase";
      this.paintAt(event.clientX, event.clientY);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (this.painting) this.paintAt(event.clientX, event.clientY);
    });
    const stop = () => {
      this.painting = null;
    };
    this.canvas.addEventListener("pointerup", stop);
    this.canvas.addEventListener("pointercancel", stop);
    this.canvas.addEventListener("pointerleave", stop);
  }

  // --- rendering ----------------------------------------------------------

  private draw() {
    const atlas = this.atlases.get(this.body);
    const context = this.canvas.getContext("2d");
    if (!context) return;

    const { width: bw, height: bh } = this.manifest.bodyFrame;
    // Room around the body so a tall hat is never cut off in the preview.
    const pad = 24;
    this.canvas.width = (bw + pad * 2) * ZOOM;
    this.canvas.height = (bh + pad * 2) * ZOOM;

    context.imageSmoothingEnabled = false;
    context.fillStyle = "#14101a";
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // A checker so transparent pixels are obvious.
    context.fillStyle = "#1d1728";
    for (let y = 0; y < this.canvas.height; y += 8 * ZOOM) {
      for (let x = 0; x < this.canvas.width; x += 8 * ZOOM) {
        if (((x / (8 * ZOOM)) + (y / (8 * ZOOM))) % 2 === 0) continue;
        context.fillRect(x, y, 8 * ZOOM, 8 * ZOOM);
      }
    }

    const originX = pad * ZOOM;
    const originY = pad * ZOOM;

    if (!atlas) {
      this.status.textContent = `No atlas for ${this.body} - run npm run sprites first.`;
      return;
    }

    const frameName =
      this.direction === "down" && this.walkFrame === 0
        ? `${this.body}_idle_down`
        : `${this.body}_walk_${this.direction}_${this.walkFrame}`;
    const frame =
      atlas.frames.get(frameName) ?? atlas.frames.get(`${this.body}_idle_${this.direction}`);

    if (frame) {
      context.drawImage(
        atlas.image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        originX,
        originY,
        frame.w * ZOOM,
        frame.h * ZOOM,
      );
    }

    // Cloak over the body, then the hat: the order the game composites them.
    this.drawOverlay(context, "cloaks", this.cloakId, originX, originY);
    this.drawOverlay(context, "hats", this.hatId, originX, originY);

    const id = this.selected === "hats" ? this.hatId : this.cloakId;
    const point = id ? this.current(this.selected, id)[this.direction] : { x: 0, y: 0 };
    this.status.textContent =
      `${this.selected.slice(0, -1)} "${id}" ${this.direction}: x ${point.x}, y ${point.y}` +
      ` · flip ${id ? this.current(this.selected, id).flip : "-"}` +
      ` · brush ${this.brush ? `ON (${this.brushSize}px)` : "off"}` +
      (this.dirty.size > 0 ? ` · ${this.dirty.size} unsaved edit(s)` : "");
  }

  private drawOverlay(
    context: CanvasRenderingContext2D,
    kind: "hats" | "cloaks",
    id: string,
    originX: number,
    originY: number,
  ) {
    if (!id) return;
    const image = this.edits.get(`${kind}/${id}`) ?? this.overlayImages.get(`${kind}/${id}`);
    if (!image) return;

    const offsets = this.current(kind, id);
    const point = offsets[this.direction];
    const mirror = this.direction === "right" && offsets.flip !== false;

    context.save();
    context.imageSmoothingEnabled = false;
    if (mirror) {
      // Mirror about the body's centre line so the garment stays on the figure.
      const centre = originX + (this.manifest.bodyFrame.width / 2) * ZOOM;
      context.translate(centre * 2, 0);
      context.scale(-1, 1);
    }
    context.drawImage(
      image,
      originX + point.x * ZOOM,
      originY + point.y * ZOOM,
      image.width * ZOOM,
      image.height * ZOOM,
    );
    context.restore();

    if (kind === this.selected) {
      context.strokeStyle = "#7ce08a";
      context.lineWidth = 1;
      context.strokeRect(
        originX + point.x * ZOOM + 0.5,
        originY + point.y * ZOOM + 0.5,
        image.width * ZOOM,
        image.height * ZOOM,
      );
    }
  }

  // --- chrome -------------------------------------------------------------

  private build(root: HTMLElement) {
    root.replaceChildren();

    const title = document.createElement("h1");
    title.textContent = "Overlay alignment";

    const help = document.createElement("p");
    help.textContent =
      "Arrow keys nudge the selected overlay by 1px. 1-4 pick the direction. " +
      "Tab switches between hat and cloak - cloaks are dormant in the game " +
      "but still cut and still worth aligning for when they come back. " +
      "F toggles the flip flag. " +
      "E toggles the eraser: left-drag rubs pixels out, right-drag paints them " +
      "back from the source. [ and ] change the brush size. Save writes both " +
      "offsets.json and any overlay you have cleaned; Reset re-cuts the " +
      "selected item from its drop.";

    const controls = document.createElement("div");
    controls.className = "row";

    controls.append(
      this.select("Body", [...BODIES], this.body, (v) => {
        this.body = v;
        this.draw();
      }),
      this.select(
        "Hat",
        ["", ...this.manifest.hats.map((h) => h.id)],
        this.hatId,
        (v) => {
          this.hatId = v;
          this.draw();
        },
      ),
      this.select(
        "Cloak",
        ["", ...this.manifest.cloaks.map((a) => a.id)],
        this.cloakId,
        (v) => {
          this.cloakId = v;
          this.draw();
        },
      ),
      this.select("Editing", ["hats", "cloaks"], this.selected, (v) => {
        this.selected = v as "hats" | "cloaks";
        this.draw();
      }),
      this.select("Frame", ["0", "1", "2", "3"], "0", (v) => {
        this.walkFrame = Number(v);
        this.draw();
      }),
    );

    const save = document.createElement("button");
    save.textContent = "Save";
    save.addEventListener("click", () => void this.save(save));

    const reset = document.createElement("button");
    reset.textContent = "Reset this item";
    reset.addEventListener("click", () => void this.reset(reset));

    const buttons = document.createElement("div");
    buttons.className = "row";
    buttons.append(save, reset);

    this.bindBrush();
    root.append(title, help, controls, this.canvas, this.status, buttons);
  }

  private select(
    label: string,
    options: string[],
    value: string,
    onChange: (value: string) => void,
  ): HTMLElement {
    const wrap = document.createElement("label");
    wrap.textContent = `${label} `;
    const select = document.createElement("select");
    for (const option of options) {
      const element = document.createElement("option");
      element.value = option;
      element.textContent = option || "(none)";
      if (option === value) element.selected = true;
      select.append(element);
    }
    select.addEventListener("change", () => onChange(select.value));
    wrap.append(select);
    return wrap;
  }

  private bindKeys() {
    window.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 4 : 1;
      switch (event.code) {
        case "ArrowLeft":
          this.nudge(-step, 0);
          break;
        case "ArrowRight":
          this.nudge(step, 0);
          break;
        case "ArrowUp":
          this.nudge(0, -step);
          break;
        case "ArrowDown":
          this.nudge(0, step);
          break;
        case "Digit1":
        case "Digit2":
        case "Digit3":
        case "Digit4": {
          this.direction = DIRECTIONS[Number(event.code.slice(-1)) - 1] ?? "down";
          this.draw();
          break;
        }
        case "Tab":
          this.selected = this.selected === "hats" ? "cloaks" : "hats";
          this.draw();
          break;
        case "KeyE":
          this.brush = !this.brush;
          this.canvas.style.cursor = this.brush ? "crosshair" : "default";
          this.draw();
          break;
        case "BracketLeft":
          this.brushSize = Math.max(1, this.brushSize - 1);
          this.draw();
          break;
        case "BracketRight":
          this.brushSize = Math.min(12, this.brushSize + 1);
          this.draw();
          break;
        case "KeyF": {
          const id = this.selected === "hats" ? this.hatId : this.cloakId;
          if (id) {
            const offsets = this.current(this.selected, id);
            offsets.flip = !offsets.flip;
            this.draw();
          }
          break;
        }
        default:
          return;
      }
      event.preventDefault();
    });
  }

  private async save(button: HTMLButtonElement) {
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const response = await fetch("/dev/offsets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.offsets, null, 2),
      });
      if (!response.ok) throw new Error(`offsets ${response.status}`);

      // Any overlay the eraser touched goes back to generated/ as a PNG, so
      // the game and the next pipeline run both see the cleaned art.
      for (const key of [...this.dirty]) {
        const [kind, id] = key.split("/") as ["hats" | "cloaks", string];
        const surface = this.edits.get(key);
        if (!surface) continue;
        const written = await fetch("/dev/overlay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, id, png: surface.toDataURL("image/png") }),
        });
        if (!written.ok) throw new Error(`${id} ${written.status}`);
        this.dirty.delete(key);
      }
      button.textContent = "Saved";
    } catch (err) {
      button.textContent = `Failed: ${(err as Error).message}`;
    }
    this.draw();
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Save";
    }, 1500);
  }

  /**
   * Throws away every hand edit for the selected item and re-cuts it.
   *
   * One item rather than the whole pipeline: erasing has no undo beyond going
   * back to the source, and re-running everything would also discard the other
   * fifteen overlays somebody may have already cleaned.
   */
  private async reset(button: HTMLButtonElement) {
    const id = this.selected === "hats" ? this.hatId : this.cloakId;
    if (!id) return;

    button.disabled = true;
    button.textContent = "Re-cutting…";
    try {
      const response = await fetch("/dev/recut", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json()) as { ok: boolean; output?: string; error?: string };
      if (!result.ok) throw new Error(result.error ?? "re-cut failed");

      const key = `${this.selected}/${id}`;
      this.edits.delete(key);
      this.dirty.delete(key);
      // Cache-busted, or the browser hands back the file we just replaced.
      this.overlayImages.set(
        key,
        await loadImage(`${GENERATED}/${this.selected}/${id}.png?t=${Date.now()}`),
      );
      button.textContent = "Re-cut";
    } catch (err) {
      button.textContent = `Failed: ${(err as Error).message}`;
    }
    this.draw();
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Reset this item";
    }, 1500);
  }
}

const root = document.getElementById("app");
if (root) void new AlignTool().start(root);
