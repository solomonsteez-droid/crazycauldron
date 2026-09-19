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

/* Modal windows: the kitchen, tavern, shop, inventory and so on. */
.cc-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(520px, calc(100vw - 32px));
  max-height: min(70vh, 640px);
  display: flex;
  flex-direction: column;
  background: rgba(20, 16, 26, 0.97);
  border: 1px solid #3a3050;
  border-radius: 10px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
}
.cc-modal header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #2c2440;
}
.cc-modal h2 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.cc-modal p { margin: 0 0 10px; color: #9a8f7a; }
.cc-modal small { color: #6f6656; }
.cc-modal-body { padding: 14px 16px 16px; overflow-y: auto; }
.cc-close {
  padding: 0 6px;
  font: inherit;
  font-size: 18px;
  line-height: 1;
  color: #9a8f7a;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.cc-close:hover { color: #f3e9d2; }

/* Scrolling rows shared by the kitchen, tavern, shop and inventory. */
.cc-list { display: flex; flex-direction: column; gap: 6px; }
.cc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  background: rgba(44, 36, 64, 0.35);
  border: 1px solid #2c2440;
  border-radius: 6px;
}
.cc-row strong { font-weight: 600; }
.cc-row small { display: block; margin-top: 2px; font-size: 11px; }
.cc-row .cc-btn { flex: 0 0 auto; padding: 6px 12px; font-size: 12px; }
.cc-dim { opacity: 0.55; }
.cc-dim strong { color: #9a8f7a; }

/* The heat bar. */
.cc-heat {
  position: relative;
  height: 28px;
  margin: 6px 0 14px;
  background: linear-gradient(90deg, #2a2136, #3a2a2a);
  border: 1px solid #3a3050;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
}
.cc-heat-fine,
.cc-heat-superb {
  position: absolute;
  top: 0;
  bottom: 0;
  display: block;
}
/* Fine is the wide, dim saffron band; Superb the narrow bright green core. */
.cc-heat-fine {
  background: rgba(242, 181, 59, 0.30);
  border-left: 1px solid rgba(242, 181, 59, 0.75);
  border-right: 1px solid rgba(242, 181, 59, 0.75);
}
.cc-heat-superb {
  background: rgba(124, 224, 138, 0.70);
  box-shadow: 0 0 6px rgba(124, 224, 138, 0.55);
}
.cc-heat-marker {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 3px;
  margin-left: -1px;
  background: #f3e9d2;
  box-shadow: 0 0 6px rgba(243, 233, 210, 0.9);
}
.cc-progress.cc-inline {
  position: static;
  transform: none;
  width: 100%;
  margin-bottom: 12px;
}
.cc-cook .cc-btn { width: 100%; }

/* Skill and XP bars in the skills panel. */
.cc-meter {
  height: 6px;
  margin-top: 4px;
  background: #241d33;
  border-radius: 3px;
  overflow: hidden;
}
.cc-meter > i { display: block; height: 100%; background: #7ce08a; }
.cc-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.cc-tab {
  padding: 5px 10px;
  font: inherit;
  font-size: 12px;
  color: #cbbfa6;
  background: transparent;
  border: 1px solid #3a3050;
  border-radius: 5px;
  cursor: pointer;
}
.cc-tab[aria-selected="true"] { color: #14101a; background: #7ce08a; border-color: #7ce08a; }

/* Station buttons pinned bottom-left, the way a toolbar reads. */
.cc-dock {
  position: fixed;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cc-dock button {
  padding: 7px 11px;
  font: inherit;
  font-size: 12px;
  color: #cbbfa6;
  background: rgba(20, 16, 26, 0.85);
  border: 1px solid #3a3050;
  border-radius: 6px;
  cursor: pointer;
}
.cc-dock button:hover { color: #f3e9d2; border-color: #7ce08a; }

/* Wardrobe grid. */
.cc-subhead {
  margin: 12px 0 6px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9a8f7a;
}
.cc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
.cc-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 9px;
  min-height: 52px;
  font: inherit;
  text-align: left;
  color: #f3e9d2;
  background: rgba(44, 36, 64, 0.35);
  border: 1px solid #2c2440;
  border-radius: 6px;
  cursor: pointer;
}
.cc-slot:hover:not(:disabled) { border-color: #7ce08a; }
.cc-slot strong { font-size: 12px; }
.cc-slot small { font-size: 10px; color: #6f6656; line-height: 1.3; }
.cc-slot.cc-locked { opacity: 0.45; cursor: not-allowed; filter: grayscale(1); }
.cc-slot.cc-equipped { border-color: #7ce08a; background: rgba(124, 224, 138, 0.12); }
.cc-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 1px 5px;
  font-size: 9px;
  font-style: normal;
  border-radius: 3px;
  color: #14101a;
}
.cc-bronze { background: #c98a4b; }
.cc-silver { background: #c9d2dd; }
.cc-gold { background: #f7d372; }

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

/* ------------------------------------------------------------------------ */
/* Modals                                                                     */
/* ------------------------------------------------------------------------ */

export interface ModalHandle {
  readonly body: HTMLElement;
  readonly element: HTMLElement;
  setTitle(text: string): void;
  close(): void;
  onClose(callback: () => void): void;
}

/**
 * A dismissible window layered over the world.
 *
 * Unlike showPanel this does not clear the overlay, because the HUD has to stay
 * visible behind it. Only one modal is open at a time - opening a second closes
 * the first, which keeps the kitchen and the tavern from stacking up.
 */
export function openModal(title: string, className = ""): ModalHandle {
  ensureStyles();
  for (const existing of document.querySelectorAll(".cc-modal")) existing.remove();

  const modal = document.createElement("div");
  modal.className = className ? `cc-modal ${className}` : "cc-modal";

  const header = document.createElement("header");
  const heading = document.createElement("h2");
  heading.textContent = title;

  const close = document.createElement("button");
  close.className = "cc-close";
  close.textContent = "\u00d7";
  close.setAttribute("aria-label", "Close");

  header.append(heading, close);

  const body = document.createElement("div");
  body.className = "cc-modal-body";

  modal.append(header, body);
  uiRoot().append(modal);

  const closers: (() => void)[] = [];
  const handle: ModalHandle = {
    element: modal,
    body,
    setTitle(text) {
      heading.textContent = text;
    },
    close() {
      if (!modal.isConnected) return;
      modal.remove();
      for (const callback of closers) callback();
    },
    onClose(callback) {
      closers.push(callback);
    },
  };

  close.addEventListener("click", () => handle.close());
  return handle;
}

/** A labelled button row, used by every panel. */
export function buttonRow(actions: Action[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "cc-actions";
  for (const action of actions) {
    const button = document.createElement("button");
    button.className = action.secondary ? "cc-btn cc-secondary" : "cc-btn";
    button.textContent = action.label;
    button.addEventListener("click", () => void action.onClick());
    row.append(button);
  }
  return row;
}
