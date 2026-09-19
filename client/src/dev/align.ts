/**
 * The overlay alignment tool, served at /dev/align in development only.
 *
 * The pipeline guesses where each hat and apron sits on the body. That guess is
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
  private apronId = "";
  private selected: "hats" | "aprons" = "hats";
  private walkFrame = 0;

  private readonly canvas = document.createElement("canvas");
  private readonly status = document.createElement("p");

  async start(root: HTMLElement) {
    const art = await loadArt();
    this.manifest = art.manifest;
    this.offsets = art.offsets;

    for (const body of BODIES) {
      const atlas = await loadAtlas(body);
      if (atlas) this.atlases.set(body, atlas);
    }
    for (const kind of ["hats", "aprons"] as const) {
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
    this.apronId = this.manifest.aprons[0]?.id ?? "";

    this.build(root);
    this.bindKeys();
    this.draw();
  }

  // --- offsets ------------------------------------------------------------

  private entry(kind: "hats" | "aprons", id: string): OverlayEntry | undefined {
    return this.manifest[kind].find((e) => e.id === id);
  }

  private current(kind: "hats" | "aprons", id: string): ItemOffsets {
    const existing = this.offsets[kind][id];
    if (existing) return existing;
    const fresh = defaultOffsets(this.entry(kind, id));
    this.offsets[kind][id] = fresh;
    return fresh;
  }

  private nudge(dx: number, dy: number) {
    const id = this.selected === "hats" ? this.hatId : this.apronId;
    if (!id) return;
    const offsets = this.current(this.selected, id);
    const point = offsets[this.direction];
    point.x += dx;
    point.y += dy;
    this.draw();
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

    // Apron first, then hat: the order the game composites them in.
    this.drawOverlay(context, "aprons", this.apronId, originX, originY);
    this.drawOverlay(context, "hats", this.hatId, originX, originY);

    const id = this.selected === "hats" ? this.hatId : this.apronId;
    const point = id ? this.current(this.selected, id)[this.direction] : { x: 0, y: 0 };
    this.status.textContent =
      `${this.selected.slice(0, -1)} "${id}" ${this.direction}: x ${point.x}, y ${point.y}` +
      ` · flip ${id ? this.current(this.selected, id).flip : "-"}`;
  }

  private drawOverlay(
    context: CanvasRenderingContext2D,
    kind: "hats" | "aprons",
    id: string,
    originX: number,
    originY: number,
  ) {
    if (!id) return;
    const image = this.overlayImages.get(`${kind}/${id}`);
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
      "Tab switches between hat and apron. F toggles the flip flag.";

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
        "Apron",
        ["", ...this.manifest.aprons.map((a) => a.id)],
        this.apronId,
        (v) => {
          this.apronId = v;
          this.draw();
        },
      ),
      this.select("Editing", ["hats", "aprons"], this.selected, (v) => {
        this.selected = v as "hats" | "aprons";
        this.draw();
      }),
      this.select("Frame", ["0", "1", "2", "3"], "0", (v) => {
        this.walkFrame = Number(v);
        this.draw();
      }),
    );

    const save = document.createElement("button");
    save.textContent = "Save offsets.json";
    save.addEventListener("click", () => void this.save(save));

    root.append(title, help, controls, this.canvas, this.status, save);
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
          this.selected = this.selected === "hats" ? "aprons" : "hats";
          this.draw();
          break;
        case "KeyF": {
          const id = this.selected === "hats" ? this.hatId : this.apronId;
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
      button.textContent = response.ok ? "Saved" : `Failed (${response.status})`;
    } catch (err) {
      button.textContent = `Failed: ${(err as Error).message}`;
    }
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Save offsets.json";
    }, 1500);
  }
}

const root = document.getElementById("app");
if (root) void new AlignTool().start(root);
