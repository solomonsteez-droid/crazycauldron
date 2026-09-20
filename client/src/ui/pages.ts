/**
 * The three pages that are not the game: /official, /rules and /roadmap.
 *
 * They live in the same bundle and are served by the same Express, so there is
 * one deployment and one version of the truth. A request for /rules gets
 * index.html, this file notices the path, and the game never boots.
 *
 * /official exists for one reason. A token project attracts people who
 * register a similar name and publish a different contract address, and the
 * only defence is a page at the real domain that says what the real address
 * is. That address is fetched from the server rather than compiled in, so it
 * is the one the running deployment actually gates on.
 */

import { env } from "../net/env.js";

/** Paths this module owns. Anything else boots the game as usual. */
export const PAGE_PATHS = ["/official", "/rules", "/roadmap"] as const;
export type PagePath = (typeof PAGE_PATHS)[number];

/** The page the current URL asks for, or null when it is asking for the game. */
export function pageFor(pathname: string): PagePath | null {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  return (PAGE_PATHS as readonly string[]).includes(trimmed) ? (trimmed as PagePath) : null;
}

interface PublicConfig {
  domain: string;
  cookMint: string;
  minHold: number;
  social: { x: string; telegram: string };
}

const FALLBACK: PublicConfig = {
  domain: "crazycauldron.art",
  cookMint: "",
  minHold: 0,
  social: { x: "none", telegram: "none" },
};

async function publicConfig(): Promise<PublicConfig> {
  try {
    const res = await fetch(`${env.httpUrl}/public/config`);
    if (!res.ok) return FALLBACK;
    return (await res.json()) as PublicConfig;
  } catch {
    return FALLBACK;
  }
}

/** The shared look: one stylesheet for all three, injected once. */
function styles(): void {
  const style = document.createElement("style");
  style.textContent = `
    /*
     * These pages carry their own colours rather than borrowing the shell's.
     *
     * They used to be drawn by the game's bundle, inside the game's document,
     * where the inline stylesheet had already defined all four. They are drawn
     * by the site bundle now, in a document that has its own palette and no
     * reason to keep a duplicate of this one - so if they are not declared
     * here, /rules renders as black text on black.
     */
    :root {
      --ink: #f3e9d2;
      --dim: #9a8f7a;
      --bg: #14101a;
      --accent: #7ce08a;
      color-scheme: dark;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }

    /*
     * The game shell pins the document: html and body are 100% tall with
     * overflow hidden, so a drag cannot scroll the world out from under the
     * canvas. A page is the opposite - it is a document, and has to scroll.
     */
    html, body { height: auto; overflow: auto; overscroll-behavior: auto; }
    .cc-page {
      max-width: 44rem;
      margin: 0 auto;
      padding: 2.5rem 1rem 5rem;
      line-height: 1.7;
    }
    .cc-page h1 { font-size: 1.6rem; letter-spacing: 0.06em; margin: 0 0 0.25rem; }
    .cc-page h2 { font-size: 1.05rem; margin: 2.2rem 0 0.6rem; color: var(--accent); }
    .cc-page h3 { font-size: 0.95rem; margin: 1.6rem 0 0.4rem; }
    .cc-page p, .cc-page li { color: var(--ink); }
    .cc-page .lead { color: var(--dim); margin: 0 0 2rem; }
    .cc-page a { color: var(--accent); }
    .cc-page code { background: #221c2b; padding: 0.1rem 0.3rem; border-radius: 3px; }
    .cc-page table { border-collapse: collapse; width: 100%; margin: 0.8rem 0; }
    .cc-page th, .cc-page td {
      border: 1px solid #2c2436;
      padding: 0.45rem 0.6rem;
      text-align: left;
      vertical-align: top;
    }
    .cc-page th { color: var(--dim); font-weight: normal; }
    .cc-nav { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .cc-nav a { text-decoration: none; }
    .cc-address {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      flex-wrap: wrap;
      background: #1c1725;
      border: 1px solid #2c2436;
      border-radius: 6px;
      padding: 0.8rem;
      margin: 0.6rem 0;
    }
    .cc-address code { background: none; word-break: break-all; flex: 1 1 18rem; }
    .cc-address button {
      font: inherit;
      color: var(--bg);
      background: var(--accent);
      border: 0;
      border-radius: 4px;
      padding: 0.35rem 0.9rem;
      cursor: pointer;
    }
    .cc-warn {
      border-left: 3px solid #e0a97c;
      background: #241c18;
      padding: 0.7rem 0.9rem;
      margin: 1rem 0;
    }
    .cc-note { color: var(--dim); font-size: 0.9em; }
  `;
  document.head.append(style);
}

/** The links every page carries, so none of them is a dead end. */
function nav(current: PagePath): HTMLElement {
  const bar = document.createElement("nav");
  bar.className = "cc-nav";
  for (const [href, label] of [
    ["/", "← Play"],
    ["/official", "Official"],
    ["/rules", "Rules"],
    ["/roadmap", "Roadmap"],
  ] as const) {
    if (href === current) continue;
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    bar.append(link);
  }
  return bar;
}

function heading(title: string, lead: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const h1 = document.createElement("h1");
  h1.textContent = title;
  const p = document.createElement("p");
  p.className = "lead";
  p.textContent = lead;
  fragment.append(h1, p);
  return fragment;
}

/** A contract address with a button that copies it. */
function addressBox(address: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "cc-address";

  const code = document.createElement("code");
  code.textContent = address || "not published yet";
  box.append(code);

  if (address) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Copy";
    button.addEventListener("click", () => {
      void navigator.clipboard?.writeText(address).then(
        () => {
          button.textContent = "Copied";
          setTimeout(() => (button.textContent = "Copy"), 1500);
        },
        () => {
          // Clipboard access can be refused; selecting the text still works.
          button.textContent = "Select it";
        },
      );
    });
    box.append(button);
  }
  return box;
}

function paragraph(text: string, className?: string): HTMLElement {
  const p = document.createElement("p");
  p.textContent = text;
  if (className) p.className = className;
  return p;
}

function list(items: string[]): HTMLElement {
  const ul = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.append(li);
  }
  return ul;
}

async function official(root: HTMLElement): Promise<void> {
  const cfg = await publicConfig();
  document.title = "CrazyCauldron - Official";

  root.append(
    heading(
      "Official",
      "Everything real about CrazyCauldron is on this page. If you found it anywhere else, check it here first.",
    ),
  );

  const domain = document.createElement("h2");
  domain.textContent = "The site";
  const domainLine = document.createElement("p");
  const link = document.createElement("a");
  link.href = `https://${cfg.domain}`;
  link.textContent = cfg.domain;
  domainLine.append("The game lives at ", link, ". There is no other site.");
  root.append(domain, domainLine);

  const token = document.createElement("h2");
  token.textContent = "The $COOK contract address";
  root.append(token, addressBox(cfg.cookMint));

  const warning = document.createElement("div");
  warning.className = "cc-warn";
  warning.append(
    paragraph(
      "This is the only $COOK. Any other contract address is a different token, whatever it is called and whoever is posting it.",
    ),
    paragraph(
      "Copy the address from this page and paste it into your wallet yourself. Do not trust one sent to you, and do not connect your wallet to a site you did not reach from this domain.",
      "cc-note",
    ),
  );
  root.append(warning);

  if (cfg.minHold > 0) {
    root.append(
      paragraph(
        `Holding at least ${cfg.minHold.toLocaleString()} $COOK opens the hub. The balance is checked when you sign in and while you play; nothing is ever taken from your wallet to enter.`,
      ),
    );
  }

  /*
   * Stated plainly, and carefully.
   *
   * $COOK takes standard pump.fun creator fees, which go to the treasury
   * wallet and pay for the game. Two things have to be unmistakable: where
   * they go, and that they do not come back to anybody for holding. A page
   * that only says the first sounds, to a reader who wants it to, like the
   * second - so the second is a sentence of its own, not a qualification.
   */
  const fees = document.createElement("h2");
  fees.textContent = "Where the fees go";
  root.append(
    fees,
    paragraph(
      "Trading $COOK generates standard pump.fun creator fees. Those fees are received by the team at the project treasury wallet.",
    ),
    paragraph(
      "Nothing is paid out to holders. Holding $COOK is not a claim on those fees or on any other payment, and there is no distribution, revenue share or payout attached to it.",
    ),
    paragraph(
      "The fees fund the servers and the development, and that is what they are for. Anything spent inside the game is separate again: half of a purchase is burned and half goes to the project treasury.",
      "cc-note",
    ),
  );

  const social = document.createElement("h2");
  social.textContent = "Where we post";
  root.append(social);

  const accounts: string[] = [];
  for (const [label, handle] of [
    ["X", cfg.social.x],
    ["Telegram", cfg.social.telegram],
  ] as const) {
    accounts.push(
      handle && handle !== "none"
        ? `${label}: ${handle}`
        : `${label}: no account yet. Anything claiming to be our ${label} is not ours.`,
    );
  }
  root.append(list(accounts));
  root.append(
    paragraph(
      "When an account does exist, it will be listed here first. This page is the source, not the announcement.",
      "cc-note",
    ),
  );
}

function rules(root: HTMLElement): void {
  document.title = "CrazyCauldron - Rules";
  root.append(
    heading("Rules", "Short, and in plain language. Read the last section before you buy anything."),
  );

  const playing = document.createElement("h2");
  playing.textContent = "Playing";
  root.append(
    playing,
    list([
      "Sign in with your wallet. Signing proves the wallet is yours; it never moves tokens and never asks for a key.",
      "Holding enough $COOK opens the hub. Nothing is spent to enter, and your tokens stay in your wallet.",
      "Everything you gather, cook and earn belongs to the wallet that earned it, and is there when you come back.",
      "Play fairly. The server decides what happened - where you are, what you gathered, what you cooked - so a modified client gains nothing and a wallet that keeps trying will be shut out.",
      "One person, as many wallets as you like. But progress does not transfer between them, and neither do cosmetics.",
    ]),
  );

  const cosmetics = document.createElement("h2");
  cosmetics.textContent = "Cosmetics";
  root.append(
    cosmetics,
    list([
      "Hats and cloaks are cosmetic. None of them changes how fast you gather, how well you cook, or what you earn.",
      "Most are earned by playing. Some can also be bought with $COOK, and nothing is ever purchase-only.",
      "A few are tied to your $COOK balance rather than owned. If the balance falls, the garment comes off and returns when it recovers.",
      "Cosmetics belong to the wallet, not to you. They are not tradable and cannot be moved to another wallet.",
    ]),
  );

  const money = document.createElement("h2");
  money.textContent = "About $COOK";
  const disclaimer = document.createElement("div");
  disclaimer.className = "cc-warn";
  disclaimer.append(
    paragraph(
      "$COOK is a community token. It is not a share, not an investment, and not a claim on anything we own or earn.",
    ),
    paragraph(
      "Trading $COOK generates standard pump.fun creator fees, which the team receives at the project treasury wallet and uses to run the servers and build the game. Nothing is paid out to holders.",
    ),
    paragraph(
      "We make no promise about its price, and no promise of rewards, income, airdrops or returns of any kind. Nothing on this site is financial advice.",
    ),
    paragraph(
      "There are no cash prizes. Nothing in the game pays out money, and coins earned by playing exist only inside the game.",
    ),
    paragraph(
      "Anything you spend is spent. A purchase burns half the tokens and sends half to the project treasury; neither half comes back, and there are no refunds.",
    ),
    paragraph(
      "Only buy what you can afford to lose. Token prices go down as easily as up, and this one can go to nothing.",
    ),
  );
  root.append(money, disclaimer);

  const game = document.createElement("h2");
  game.textContent = "What we can change";
  root.append(
    game,
    list([
      "The game is under development. Numbers get tuned, features get added, and things occasionally break.",
      "We may change prices, drop rates and unlock conditions. We will not take away a cosmetic you have earned.",
      "The roadmap is a plan, not a promise. What gets built, and when, depends on how many people are playing.",
    ]),
  );
}

/**
 * A small Markdown renderer for the roadmap.
 *
 * Enough for the document that is actually there - headings, paragraphs, lists,
 * tables, bold and inline code - and no more. Pulling in a parser for one
 * static file would cost more bytes than the file, and this one builds nodes
 * rather than assigning HTML, so nothing in the document can inject markup.
 */
function renderMarkdown(source: string, root: HTMLElement): void {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  /** Splits a table row on its pipes, dropping the empty edges. */
  const cells = (line: string) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());

  /** Bold and inline code, as text nodes and elements - never as HTML. */
  const inline = (text: string, into: HTMLElement) => {
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      const at = match.index ?? 0;
      if (at > last) into.append(text.slice(last, at));
      const token = match[0];
      if (token.startsWith("`")) {
        const code = document.createElement("code");
        code.textContent = token.slice(1, -1);
        into.append(code);
      } else {
        const strong = document.createElement("strong");
        strong.textContent = token.slice(2, -2);
        into.append(strong);
      }
      last = at + token.length;
    }
    if (last < text.length) into.append(text.slice(last));
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,4})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = Math.min(headingMatch[1]!.length, 4);
      const element = document.createElement(`h${level}`);
      inline(headingMatch[2]!, element);
      root.append(element);
      index += 1;
      continue;
    }

    // A table: a header row, a divider of dashes, then body rows.
    if (line.includes("|") && (lines[index + 1] ?? "").includes("---")) {
      const table = document.createElement("table");
      const head = document.createElement("tr");
      for (const cell of cells(line)) {
        const th = document.createElement("th");
        inline(cell, th);
        head.append(th);
      }
      table.append(head);

      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        const row = document.createElement("tr");
        for (const cell of cells(lines[index] ?? "")) {
          const td = document.createElement("td");
          inline(cell, td);
          row.append(td);
        }
        table.append(row);
        index += 1;
      }
      root.append(table);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const ul = document.createElement("ul");
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? "")) {
        const li = document.createElement("li");
        inline((lines[index] ?? "").replace(/^[-*]\s+/, ""), li);
        ul.append(li);
        index += 1;
      }
      root.append(ul);
      continue;
    }

    // Anything else is a paragraph, running until a blank line.
    const paragraphLines: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() !== "") {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }
    const p = document.createElement("p");
    inline(paragraphLines.join(" "), p);
    root.append(p);
  }
}

async function roadmap(root: HTMLElement): Promise<void> {
  document.title = "CrazyCauldron - Roadmap";
  try {
    const res = await fetch("/roadmap.md");
    if (!res.ok) throw new Error(String(res.status));
    renderMarkdown(await res.text(), root);
  } catch {
    root.append(
      heading("Roadmap", "The roadmap could not be loaded just now. Please try again shortly."),
    );
  }
}

/**
 * Renders the page the URL asks for. Called before the game boots, and returns
 * true when it has taken over the document.
 */
export async function renderPage(path: PagePath): Promise<void> {
  styles();
  document.getElementById("game")?.remove();
  document.getElementById("boot")?.remove();

  const root = document.createElement("main");
  root.className = "cc-page";
  root.append(nav(path));

  const ui = document.getElementById("ui") ?? document.body;
  ui.replaceChildren(root);
  // The UI layer is laid out for a floating panel; a page is a document.
  ui.setAttribute("style", "position:static;display:block;pointer-events:auto");

  if (path === "/official") await official(root);
  else if (path === "/rules") rules(root);
  else await roadmap(root);
}
