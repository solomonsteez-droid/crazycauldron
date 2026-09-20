/**
 * What you can wear, what the token is for, and the addresses.
 *
 * The wardrobe is read from shared/src/content/wardrobe.json and its unlock
 * conditions are rendered by the game's own describeUnlockRule, so a condition
 * cannot be retuned in the game and left wrong on the page.
 *
 * The token section is the one that has to be careful. It says where the fees
 * go and, in its own sentence, that nothing comes back to holders - because a
 * reader who wants to hear otherwise will hear it in any description that only
 * says the first half.
 */

import {
  WARDROBE_ITEMS,
  WARDROBE_TIERS,
  describeUnlockRule,
  type WardrobeItem,
} from "@crazycauldron/shared";
import { html } from "../dom.js";
import { band } from "../layout.js";
import { SPRITES } from "../sprites.js";
import type { SiteConfig } from "../data.js";
import { handle, shorten } from "../text.js";

const TIER_BLURB: Record<string, string> = {
  bronze: "A toque.",
  silver: "A companion.",
  gold: "A toque and a companion.",
};

function wardrobeCard(item: WardrobeItem): ReturnType<typeof html> {
  const art = item.kind === "hat" ? SPRITES.hat(item.id) : SPRITES.companion(item.id);
  const tier = item.unlock.type === "tier" ? item.unlock.tier : null;

  return html`
    <article class="card">
      <div class="sprite-tile">
        <img
          class="sprite"
          src="${art}"
          alt="${item.name}"
          loading="lazy"
          decoding="async"
          style="height: ${item.kind === "hat" ? "3.4rem" : "4rem"}; width: auto"
        />
      </div>
      <h3>${item.name}</h3>
      <p class="meta">${describeUnlockRule(item.unlock)}</p>
      ${tier ? html`<span class="tier tier-${tier}">${tier}</span>` : ""}
    </article>
  `;
}

export function wardrobeSection(): ReturnType<typeof html> {
  const hats = WARDROBE_ITEMS.filter((item) => item.kind === "hat");
  const companions = WARDROBE_ITEMS.filter((item) => item.kind === "companion");

  return band({
    id: "wardrobe",
    painting: null,
    label: "wardrobe.txt",
    body: html`
      <h2>${hats.length} hats, ${companions.length} companions</h2>
      <p class="lead">
        All of it is cosmetic. Not one hat or companion changes how fast you gather, how
        well you cook, or what you earn — and most of them are earned by playing.
      </p>

      <h3>Hats</h3>
      <div class="gallery">${hats.map(wardrobeCard)}</div>

      <h3 style="margin-top: 1.6rem">Companions</h3>
      <p class="small muted">
        A companion follows a cell behind you and does nothing else at all.
      </p>
      <div class="gallery">${companions.map(wardrobeCard)}</div>

      <h3 style="margin-top: 1.6rem">Holder tiers</h3>
      <p class="small">
        Three of the items above are tied to a balance rather than owned. They are
        cosmetic like everything else here: if the balance falls the item comes off, and
        it returns when the balance recovers.
      </p>
      <div class="grid cols-3">
        ${WARDROBE_TIERS.map(
          (tier) => html`
            <div class="card">
              <span class="tier tier-${tier.id}">${tier.id}</span>
              <h3 style="margin-top: 0.4rem">${tier.minHold.toLocaleString()} $COOK</h3>
              <p class="small muted">${TIER_BLURB[tier.id] ?? ""} Cosmetic only.</p>
            </div>
          `,
        )}
      </div>
    `,
  });
}

/**
 * The contract address, or an honest placeholder.
 *
 * SHOW_MINT is a separate switch from COOK_MINT having a value, and it is a
 * switch on purpose: the mint in the configuration before launch is a stand-in,
 * and a stand-in rendered as "the contract address" is how somebody sends money
 * to the wrong place. Until it is flipped the page says what is true, which is
 * that the address does not exist yet.
 */
function addressBlock(config: SiteConfig): ReturnType<typeof html> {
  if (!config.showMint || config.cookMint.trim() === "") {
    return html`
      <div class="address">
        <code>Revealed at launch</code>
        <span class="small muted">
          There is no $COOK contract address yet. Anyone showing you one is not us.
        </span>
      </div>
    `;
  }

  return html`
    <div class="address">
      <code>${config.cookMint}</code>
      <button class="btn btn-primary" data-copy="${config.cookMint}">Copy</button>
    </div>
  `;
}

export function tokenSection(config: SiteConfig): ReturnType<typeof html> {
  const buyable = config.showMint && config.cookMint.trim() !== "";

  return band({
    id: "token",
    painting: "map_hub",
    label: "token.txt",
    body: html`
      <h2>$COOK is the key, not the game</h2>
      <div class="grid cols-2">
        <div>
          <p class="lead">
            Holding ${config.minHold.toLocaleString()} $COOK opens the hub. That is what
            it is for. It is not spent to play, it is not staked, and no amount of it
            makes a dish cook better.
          </p>
          <ul>
            <li><strong>Entry.</strong> ${config.minHold.toLocaleString()} $COOK in the wallet you sign in with.</li>
            <li><strong>Cosmetics.</strong> Three wardrobe items follow a balance, and a $COOK cosmetics shop is built but switched off.</li>
            <li><strong>Seasonal votes.</strong> Planned: holders vote on what a season brings.</li>
          </ul>
        </div>
        <div>
          <h3>Where the fees go</h3>
          <p class="small">
            Trading $COOK generates standard pump.fun creator fees. Those fees are
            received by the team at the project treasury wallet and pay for the servers
            and the development.
          </p>
          <p class="small">
            <strong>Nothing is paid out to holders.</strong> Holding $COOK is not a
            claim on those fees or on any other payment, and there is no distribution,
            revenue share or payout attached to it.
          </p>
        </div>
      </div>

      <h3 style="margin-top: 1.6rem">The contract address</h3>
      ${addressBlock(config)}
      <div class="warn small">
        <strong>One address, one domain.</strong> The only official site is
        ${config.domain}, and the address above is the one this server gates on — it is
        read from the running deployment, not written into the page. Any other contract
        address is a different token, whoever is posting it.
      </div>

      <h3 style="margin-top: 1.6rem">How to buy, in three taps</h3>
      <ol class="steps">
        <li>
          <h3>Get SOL in Phantom</h3>
          <p class="small muted">Any Solana wallet works; Phantom is the one most people have.</p>
        </li>
        <li>
          <h3>Paste the address</h3>
          <p class="small muted">
            ${buyable
              ? "Open pump.fun or Jupiter, paste the address above, and swap."
              : "At launch: open pump.fun or Jupiter and paste the address above."}
          </p>
        </li>
        <li>
          <h3>Hold ${config.minHold.toLocaleString()} and play</h3>
          <p class="small muted">Come back to this page, press Play, and sign in.</p>
        </li>
      </ol>
      <p class="small muted">
        Only buy what you can afford to lose. Token prices go down as easily as up, and
        this one can go to nothing.
      </p>
    `,
  });
}

export function proofSection(config: SiteConfig): ReturnType<typeof html> {
  const x = handle(config.social.x);
  const telegram = handle(config.social.telegram);

  const rows: { label: string; value: string; copy?: string; href?: string }[] = [
    { label: "Official domain", value: config.domain, href: `https://${config.domain}` },
    {
      label: "Contract address",
      value:
        config.showMint && config.cookMint.trim() !== ""
          ? config.cookMint
          : "Revealed at launch",
      copy: config.showMint && config.cookMint.trim() !== "" ? config.cookMint : undefined,
    },
    {
      label: "Treasury wallet",
      value: config.treasuryWallet.trim() === "" ? "Published at launch" : config.treasuryWallet,
      copy: config.treasuryWallet.trim() === "" ? undefined : config.treasuryWallet,
    },
    {
      label: "X",
      value: x ?? "We have no X account",
      href: x ? `https://x.com/${x}` : undefined,
    },
    {
      label: "Telegram",
      value: telegram ?? "We have no Telegram",
      href: telegram ? `https://t.me/${telegram}` : undefined,
    },
  ];

  return band({
    id: "proof",
    painting: null,
    label: "proof.txt",
    body: html`
      <h2>Everything you should check</h2>
      <p class="lead">
        A token project attracts people who register a similar name and publish a
        different address. The defence is a short list at the real domain, so here it is.
        "We have no account there" is a real answer, and a better one than silence.
      </p>

      <div class="grid">
        ${rows.map(
          (row) => html`
            <div class="address">
              <span class="small muted mono" style="flex: 0 0 9rem">${row.label}</span>
              ${row.href
                ? html`<code><a href="${row.href}" rel="noopener">${row.value}</a></code>`
                : html`<code title="${row.value}">${
                    row.value.length > 48 ? shorten(row.value, 14) : row.value
                  }</code>`}
              ${row.copy ? html`<button class="btn" data-copy="${row.copy}">Copy</button>` : ""}
            </div>
          `,
        )}
      </div>
      <p class="small muted">
        The source is private, so there is no repository to link. The pages that matter
        are <a href="/official">/official</a> and <a href="/rules">/rules</a>, and both
        read their facts from this server at request time.
      </p>

      <div class="warn">
        <p class="small">
          <strong>$COOK is a community token.</strong> It is not a share, not an
          investment, and not a claim on anything we own or earn. We make no promise
          about its price, and no promise of rewards, income, airdrops or returns of any
          kind. Nothing on this site is financial advice.
        </p>
        <p class="small">
          There are no cash prizes. Nothing in the game pays out money, and the coins you
          earn by playing exist only inside the game. Cosmetics belong to the wallet, not
          to you: they are not tradable and cannot be moved to another wallet.
        </p>
      </div>
    `,
  });
}
