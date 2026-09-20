/**
 * Building the marketing site's markup.
 *
 * The site is mostly prose. Writing prose with `document.createElement` - the
 * way the three small legal pages do it - stopped being reasonable somewhere
 * around the third section, so this is a tagged template instead: the literal
 * parts are the markup, and everything interpolated is escaped unless it is
 * explicitly marked as markup already.
 *
 * That default is the whole point. Recipe names, ingredient names, unlock
 * conditions and the contract address all come from data, and a template that
 * escapes by default cannot be the place an injection gets in.
 */

/** Markup that has already been built, and must not be escaped again. */
class Raw {
  constructor(readonly markup: string) {}
}

/** Marks a string as markup. Only ever called on something this module built. */
export function raw(markup: string): Raw {
  return new Raw(markup);
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Text, made safe to drop between tags or inside a double-quoted attribute. */
export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function render(value: unknown): string {
  if (value instanceof Raw) return value.markup;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false) return "";
  return esc(value);
}

/** The template itself. Arrays are joined, so a `.map` can be interpolated. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i += 1) {
    out += render(values[i]) + (strings[i + 1] ?? "");
  }
  return new Raw(out);
}

/** Puts built markup into an element, replacing whatever was there. */
export function mount(target: Element, markup: Raw): void {
  target.innerHTML = markup.markup;
}

/** A `<style>` element, added once. Later calls with the same id do nothing. */
export function style(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const element = document.createElement("style");
  element.id = id;
  element.textContent = css;
  document.head.append(element);
}

/**
 * A whole number with thousands separators, or a placeholder.
 *
 * The live counters start as an em dash rather than a zero. "0 players" reads
 * as a claim about the game; "—" reads as a number that has not arrived yet,
 * which is what it is.
 */
export function count(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}
