/**
 * The UI is plain DOM layered over the canvas, not Phaser text objects.
 * Wallet prompts, errors and queue positions are ordinary interface work, and
 * the browser already does focus, selection and accessibility for free.
 */

const STYLE_ID = "cc-ui-style";

const CSS = `
.cc-panel {
  min-width: 320px;
  max-width: min(440px, calc(100vw - 32px));
  padding: 20px 22px;
  background: rgba(20, 16, 26, 0.92);
  border: 1px solid #3a3050;
  border-radius: 10px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
}
.cc-panel h1 {
  margin: 0 0 4px;
  font-size: 17px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.cc-panel p { margin: 0 0 14px; color: #9a8f7a; }
.cc-panel p.cc-error { color: #ff9f8c; }
.cc-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.cc-btn {
  flex: 1 1 auto;
  padding: 10px 14px;
  font: inherit;
  color: #14101a;
  background: #7ce08a;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.cc-btn:hover:not(:disabled) { background: #96eaa2; }
.cc-btn:disabled { opacity: 0.5; cursor: progress; }
.cc-btn.cc-secondary { color: #f3e9d2; background: transparent; border: 1px solid #3a3050; }
.cc-meta { margin-top: 14px; font-size: 12px; color: #6f6656; }

/* In-hub HUD, pinned rather than centred like the panels. */
.cc-hud {
  position: fixed;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #cbbfa6;
  pointer-events: none;
}
.cc-hud span {
  padding: 5px 9px;
  background: rgba(20, 16, 26, 0.75);
  border: 1px solid #2c2440;
  border-radius: 5px;
}
/* The always-on next-goal line, directly under the status strip. */
.cc-goal {
  position: fixed;
  top: 40px;
  left: 12px;
  padding: 4px 9px;
  font-size: 11px;
  color: #f2b53b;
  background: rgba(20, 16, 26, 0.75);
  border: 1px solid #2c2440;
  border-radius: 5px;
  pointer-events: none;
}

/* Progress bar for a gather or cook the server is timing. */
.cc-progress {
  position: fixed;
  left: 50%;
  bottom: 70px;
  transform: translateX(-50%);
  width: 220px;
  height: 14px;
  background: rgba(20, 16, 26, 0.9);
  border: 1px solid #3a3050;
  border-radius: 7px;
  overflow: hidden;
  pointer-events: none;
}
.cc-progress > i {
  display: block;
  height: 100%;
  width: 0;
  background: #7ce08a;
}
.cc-progress > span {
  position: absolute;
  inset: 0;
  text-align: center;
  font-size: 10px;
  line-height: 14px;
  color: #14101a;
}

.cc-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  padding: 10px 16px;
  background: rgba(20, 16, 26, 0.95);
  border: 1px solid #3a3050;
  border-left: 3px solid #7ce08a;
  border-radius: 6px;
  max-width: calc(100vw - 32px);
}
.cc-toast.cc-bad { border-left-color: #ff7a5c; }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

export function uiRoot(): HTMLElement {
  ensureStyles();
  const root = document.getElementById("ui");
  if (!root) throw new Error("#ui is missing from index.html");
  return root;
}

/** Wipes the overlay. Scenes call this on entry so none can leak into another. */
export function clearUi() {
  uiRoot().replaceChildren();
}

export interface Action {
  label: string;
  onClick: () => void | Promise<void>;
  secondary?: boolean;
}

export interface PanelOptions {
  title: string;
  body?: string;
  error?: string;
  meta?: string;
  actions?: Action[];
}

export interface PanelHandle {
  readonly element: HTMLElement;
  setBody(text: string): void;
  setError(text: string): void;
  setMeta(text: string): void;
  /** Disables every button, e.g. while a wallet popup is open. */
  setBusy(busy: boolean): void;
}

export function showPanel(options: PanelOptions): PanelHandle {
  clearUi();

  const panel = document.createElement("div");
  panel.className = "cc-panel";

  const heading = document.createElement("h1");
  heading.textContent = options.title;

  const body = document.createElement("p");
  body.textContent = options.body ?? "";
  body.hidden = !options.body;

  const error = document.createElement("p");
  error.className = "cc-error";
  error.textContent = options.error ?? "";
  error.hidden = !options.error;

  const actions = document.createElement("div");
  actions.className = "cc-actions";
  const buttons: HTMLButtonElement[] = [];

  for (const action of options.actions ?? []) {
    const button = document.createElement("button");
    button.className = action.secondary ? "cc-btn cc-secondary" : "cc-btn";
    button.textContent = action.label;
    button.addEventListener("click", () => void action.onClick());
    actions.append(button);
    buttons.push(button);
  }

  const meta = document.createElement("p");
  meta.className = "cc-meta";
  meta.textContent = options.meta ?? "";
  meta.hidden = !options.meta;

  panel.append(heading, body, error, actions, meta);
  uiRoot().append(panel);

  return {
    element: panel,
    setBody(text) {
      body.textContent = text;
      body.hidden = !text;
    },
    setError(text) {
      error.textContent = text;
      error.hidden = !text;
    },
    setMeta(text) {
      meta.textContent = text;
      meta.hidden = !text;
    },
    setBusy(busy) {
      for (const button of buttons) button.disabled = busy;
    },
  };
}

/** Transient message. Replaces any toast already on screen. */
export function toast(message: string, kind: "good" | "bad" = "good", ms = 4000) {
  for (const existing of document.querySelectorAll(".cc-toast")) existing.remove();

  const el = document.createElement("div");
  el.className = kind === "bad" ? "cc-toast cc-bad" : "cc-toast";
  el.textContent = message;
  uiRoot().append(el);
  window.setTimeout(() => el.remove(), ms);
}

/**
 * A progress bar for an action the *server* is timing. The duration comes from
 * the server's reply, so the bar is a readout of the real timer rather than a
 * second timer that could disagree with it.
 */
export interface ProgressHandle {
  done(): void;
}

export function showProgress(label: string, durationMs: number): ProgressHandle {
  for (const existing of document.querySelectorAll(".cc-progress")) existing.remove();

  const wrap = document.createElement("div");
  wrap.className = "cc-progress";
  const fill = document.createElement("i");
  const text = document.createElement("span");
  text.textContent = label;
  wrap.append(fill, text);
  uiRoot().append(wrap);

  const startedAt = performance.now();
  let frame = 0;
  const tick = () => {
    const elapsed = performance.now() - startedAt;
    const fraction = Math.min(elapsed / durationMs, 1);
    fill.style.width = `${fraction * 100}%`;
    if (fraction < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    done() {
      cancelAnimationFrame(frame);
      wrap.remove();
    },
  };
}
