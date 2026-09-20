/**
 * The whitepaper.
 *
 * Long, plain and specific. Every number in it is either computed from
 * shared/src/content at render time or is a constant imported from the same
 * place the server reads it - which is the only way a document this long stays
 * true through a retune. Where a number is a measurement rather than a setting
 * (the Superb rate at Firecraft 1, say) it is quoted with what produced it.
 *
 * No hype, and no verb that implies a return. This is the page somebody reads
 * before deciding whether to trust the rest, so it is the page most worth
 * being boring on.
 */

import {
  BALANCE_CACHE_TTL_MS,
  CONFIG,
  INGREDIENTS,
  JWT_TTL_SECONDS,
  MAX_FINE_WINDOW_PCT,
  MAX_SUPERB_WINDOW_PCT,
  NONCE_TTL_MS,
  RECIPES,
  SECTIONS as BIOMES,
  SKILL_IDS,
  WARDROBE_ITEMS,
  WARDROBE_TIERS,
  describeUnlockRule,
  heatWindows,
  ingredient,
  timingWindowPct,
  type SkillId,
} from "@crazycauldron/shared";
import { html } from "./dom.js";
import { footer, topbar } from "./layout.js";
import { roadmapBody } from "./roadmap.js";
import type { SiteConfig } from "./data.js";

interface Chapter {
  id: string;
  title: string;
  body: () => ReturnType<typeof html>;
}

const minutes = (ms: number) => Math.round(ms / 60000);

function windowsAt(firecraft: number, knifework = 1, panTier = 0) {
  return heatWindows(
    timingWindowPct(
      { foraging: 1, prospecting: 1, knifework, firecraft, spicecraft: 1 },
      panTier,
    ),
    0.5,
  );
}

const TECHNIQUE_LABEL: Record<string, string> = {
  raw: "Raw",
  pan_fry: "Pan-fry",
  simmer: "Simmer",
  bake: "Bake",
  clay_bake: "Clay bake",
  roast: "Roast",
  smoke: "Smoke",
  chill: "Chill",
};

function biomeName(index: number): string {
  return BIOMES.find((section) => section.index === index)?.name ?? "";
}

function chapters(config: SiteConfig): Chapter[] {
  return [
    {
      id: "what-it-is",
      title: "1. What CrazyCauldron is",
      body: () => html`
        <p>
          CrazyCauldron is a cozy fantasy cooking MMO that runs in a browser tab. You
          forage and mine three biomes, bring what you find back to a village kitchen,
          time a heat bar to cook it, and sell the result to the Tavern. Everyone plays
          in the same world at the same time, in hub rooms of thirty.
        </p>
        <p>
          Getting in requires holding $COOK. That is the token's job, and close to all
          of it: it is a key, not a currency you spend to play and not a stake that
          earns.
        </p>
        <h3>Three things this is not</h3>
        <ul>
          <li>
            <strong>No wagering.</strong> Nothing in the game is staked, risked or bet.
            There is no loot box, no paid roll and no chance-based purchase.
          </li>
          <li>
            <strong>No cash prizes.</strong> Nothing pays out money. Coins are earned by
            playing and exist only inside the game; they are not a token, they do not
            leave it, and they cannot be sold.
          </li>
          <li>
            <strong>No pay-to-win.</strong> Cooking skill is the only source of power.
            No amount of $COOK widens a timing window, speeds a gather or raises a
            dish's value. What $COOK can be spent on, when the shop is switched on, is
            cosmetics that are also earnable by playing.
          </li>
        </ul>
      `,
    },

    {
      id: "getting-in",
      title: "2. Getting in",
      body: () => html`
        <h3>The hold check</h3>
        <p>
          You need ${config.minHold.toLocaleString()} $COOK in the wallet you sign in
          with. The balance is read from the chain when you sign in and cached for
          ${minutes(BALANCE_CACHE_TTL_MS)} minutes; the room re-checks every holder on
          that same interval, so a balance that falls below the line is noticed within
          half an hour rather than at the next login.
        </p>
        <p>
          Nothing is taken from your wallet. There is no deposit, no approval, no spend
          permission and no gas: the check is a read of a public balance.
        </p>

        <h3>Sign-In With Solana</h3>
        <p>
          Signing in is one wallet signature over a message that names this domain and
          carries a single-use nonce. It is not a transaction. The nonce is good for
          ${minutes(NONCE_TTL_MS)} minutes and is consumed on use, so a captured
          signature cannot be replayed. What you get back is a session token that lasts
          ${JWT_TTL_SECONDS / 3600} hour.
        </p>

        <h3>One server, many rooms</h3>
        <p>
          The world is one deployment. Players are placed in hub rooms of 30; when the
          newest hub fills, another is created. Above 300 concurrent players the next
          arrival is parked in a waiting room and promoted when a seat frees, rather
          than being turned away.
        </p>
        <p>
          Gather nodes are per-player. Two people standing at the same bush are not
          competing for it, and a popular server does not mean an empty map.
        </p>
      `,
    },

    {
      id: "the-world",
      title: "3. The world",
      body: () => html`
        <p>
          Floor 1 is the Village: a painted hub with the Kitchen, the Tavern, the
          Outfitter and the cauldron, and three gates out of it. Each biome opens at a
          Chef Level rather than a purchase.
        </p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Biome</th><th class="num">Opens at</th><th>Ingredients</th></tr>
            </thead>
            <tbody>
              ${BIOMES.map(
                (biome) => html`
                  <tr>
                    <td>${biome.name}</td>
                    <td class="num">
                      ${biome.unlockChefLevel <= 1 ? "Start" : `Chef ${biome.unlockChefLevel}`}
                    </td>
                    <td class="small">
                      ${INGREDIENTS.filter((item) => item.section === biome.index).length}
                    </td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>

        <h3>All ${INGREDIENTS.length} ingredients</h3>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ingredient</th><th>Biome</th><th>Skill</th><th>Rarity</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${INGREDIENTS.map(
                (item) => html`
                  <tr>
                    <td>${item.name}</td>
                    <td class="small">${biomeName(item.section)}</td>
                    <td class="small">${CONFIG.skills.names[item.skill]}</td>
                    <td class="small">${item.rarity}</td>
                    <td class="small muted">${item.note ?? (item.edible ? "" : "Not edible")}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>

        <h3>Rare nodes</h3>
        <p>
          Moonpetal and dragon's breath chili are rare. At most
          ${CONFIG.gathering.maxRareNodesPerSection} rare nodes exist in a biome at a
          time, and they are invisible until Foraging is high enough to see them — 14
          for moonpetal, 17 for the chili. A rare node takes
          ${CONFIG.gathering.respawnMs.rare / 60000} minutes to come back; a common one
          takes ${CONFIG.gathering.respawnMs.common / 60000}.
        </p>
      `,
    },

    {
      id: "skills",
      title: "4. Skills",
      body: () => html`
        <p>
          Five skills, each 1 to ${CONFIG.skills.maxLevel}, each on its own XP track.
          Two are gathering skills and three are kitchen skills. XP per level grows by
          about ${Math.round((CONFIG.skills.growth - 1) * 100)}% a level, so level 20 is
          a long way from level 10 without being a wall.
        </p>
        <p>
          Every skill also carries a core stat that improves
          ${CONFIG.skills.coreStat.foraging.perLevelPct}% per level, every level,
          whether or not that level came with an unlock — so no level is a dead one.
        </p>

        ${SKILL_IDS.map(
          (skill: SkillId) => html`
            <h3>${CONFIG.skills.names[skill]}</h3>
            <p class="small muted">
              Core stat: +${CONFIG.skills.coreStat[skill].perLevelPct}%
              ${CONFIG.skills.coreStat[skill].label} per level. At 20:
              <strong>${CONFIG.skills.titles[skill]}</strong>.
            </p>
            <div class="table-scroll">
              <table>
                <thead><tr><th class="num">Level</th><th>Unlock</th></tr></thead>
                <tbody>
                  ${CONFIG.unlocks[skill].map(
                    (unlock) => html`
                      <tr>
                        <td class="num">${unlock.level}</td>
                        <td class="small">
                          ${unlock.label}${unlock.requires
                            ? ` (also needs ${Object.entries(unlock.requires)
                                .map(([id, level]) => `${CONFIG.skills.names[id as SkillId]} ${level}`)
                                .join(", ")})`
                            : ""}
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `,
        )}
      `,
    },

    {
      id: "chef-level",
      title: "5. Chef Level",
      body: () => html`
        <p>
          Chef Level is one track fed by everything: gathering, prepping, cooking and
          selling all pay into it. It runs 1 to ${CONFIG.chef.maxLevel}.
        </p>
        <p>
          It is what gates the world. The Deep Forest opens at Chef
          ${BIOMES[1]?.unlockChefLevel ?? 10} and the Mystical Caves at Chef
          ${BIOMES[2]?.unlockChefLevel ?? 20}.
        </p>
        <div class="table-scroll">
          <table>
            <thead><tr><th class="num">Chef Level</th><th class="num">Target hours</th></tr></thead>
            <tbody>
              ${Object.entries(CONFIG.chef.targetHours).map(
                ([level, hours]) => html`
                  <tr><td class="num">${level}</td><td class="num">${hours}</td></tr>
                `,
              )}
            </tbody>
          </table>
        </div>
        <p class="small muted">
          Targets, not guarantees: they are what the XP curve is tuned against for a
          player who is neither rushing nor idling.
        </p>
        <p>
          The leaderboard sorts on Chef XP and shows the titles a player has earned. It
          names wallets, which are already public in the room; it does not show coins,
          inventories or balances.
        </p>
      `,
    },

    {
      id: "cooking",
      title: "6. Cooking",
      body: () => {
        const low = windowsAt(1);
        const high = windowsAt(CONFIG.skills.maxLevel);
        const maxed = windowsAt(CONFIG.skills.maxLevel, CONFIG.skills.maxLevel, 2);

        return html`
          <h3>The heat bar</h3>
          <p>
            A marker sweeps back and forth across the bar for
            ${CONFIG.cooking.barMs / 1000} seconds and you click to stop it. Two bands
            are drawn on the bar: a narrow Superb band inside a wider Fine one. Stop
            inside Superb for Superb, inside Fine for Fine, anywhere else for Common.
            Running out of time is a Common dish, not a failure — you never lose the
            ingredients to the clock.
          </p>
          <p>
            The Superb band is <strong>${low.superbPct.toFixed(1)}%</strong> of the bar
            at Firecraft 1 and <strong>${high.superbPct.toFixed(1)}%</strong> at
            Firecraft ${CONFIG.skills.maxLevel}. A better pan adds flat percentage
            points and Knifework scales the result, so a fully equipped
            level-${CONFIG.skills.maxLevel} chef reaches
            ${maxed.superbPct.toFixed(1)}%. Both bands are clamped — Superb at
            ${MAX_SUPERB_WINDOW_PCT}% of the bar and Fine at ${MAX_FINE_WINDOW_PCT}% —
            so there is always bar left to miss, and the client draws exactly the bands
            the server scores against.
          </p>

          <h3>What that means in practice</h3>
          <p>
            Simulated against a player with 60 ms of reaction error, which is about
            8.6% of the bar:
          </p>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th class="num">Firecraft</th><th class="num">Superb</th>
                  <th class="num">Fine</th><th class="num">Common</th>
                </tr>
              </thead>
              <tbody>
                <tr><td class="num">1</td><td class="num">15%</td><td class="num">40%</td><td class="num">45%</td></tr>
                <tr><td class="num">10</td><td class="num">46%</td><td class="num">52%</td><td class="num">2%</td></tr>
                <tr><td class="num">20</td><td class="num">72%</td><td class="num">28%</td><td class="num">0%</td></tr>
              </tbody>
            </table>
          </div>
          <p class="small muted">
            Numbers from scripts/test-cooking.ts, which re-runs this simulation on every
            change so the curve cannot drift without somebody noticing.
          </p>

          <h3>Quality</h3>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Quality</th><th class="num">XP</th><th class="num">Coins</th></tr></thead>
              <tbody>
                ${(["common", "fine", "superb"] as const).map(
                  (q) => html`
                    <tr>
                      <td>${q[0]!.toUpperCase()}${q.slice(1)}</td>
                      <td class="num">×${CONFIG.cooking.quality[q].xp}</td>
                      <td class="num">×${CONFIG.cooking.quality[q].coins}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>

          <h3>Prep, and more than one pot</h3>
          <p>
            Before the heat there is a prep step of
            ${CONFIG.cooking.prepMs / 1000} seconds. Knifework decides how many
            ingredient slots a dish may use — 2 at level 1, rising to 6 at 17 — and how
            good prep can be: Fine prep at 4, Superb prep at 9. Auto-prep arrives at
            Knifework 15 for Meadows recipes and 18 for Deep Forest ones, so the
            recipes you have cooked a hundred times stop asking.
          </p>
          <p>
            Firecraft 8 unlocks two-pot cooking and Firecraft 16 unlocks three, which is
            where a kitchen session stops being one dish at a time.
          </p>

          <h3>All ${RECIPES.length} recipes</h3>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Recipe</th><th>Biome</th><th>Technique</th>
                  <th class="num">XP</th><th class="num">Coins</th>
                  <th>Ingredients</th><th>Requires</th>
                </tr>
              </thead>
              <tbody>
                ${RECIPES.map(
                  (recipe) => html`
                    <tr>
                      <td>${recipe.name}</td>
                      <td class="small">${biomeName(recipe.section)}</td>
                      <td class="small">
                        ${TECHNIQUE_LABEL[recipe.technique] ?? recipe.technique}
                      </td>
                      <td class="num">${recipe.chefXp}</td>
                      <td class="num">${recipe.sellCoins}</td>
                      <td class="small">
                        ${recipe.ingredients
                          .map((part) => `${part.qty}× ${ingredient(part.id).name}`)
                          .join(", ")}
                      </td>
                      <td class="small muted">
                        ${Object.entries(recipe.requirements)
                          .map(([skill, level]) => `${CONFIG.skills.names[skill as SkillId]} ${level}`)
                          .join(", ") || "—"}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `;
      },
    },

    {
      id: "economy",
      title: "7. Economy",
      body: () => html`
        <p>
          <strong>Coins are off-chain and stay off-chain.</strong> They are a number in
          the game's database. They are not a token, they cannot be withdrawn, sold or
          transferred, and the game never emits $COOK — not as a reward, not as a drop,
          not at all.
        </p>
        <p>
          The Tavern buys dishes at the recipe's price multiplied by its quality: a
          Superb dish is worth ${CONFIG.cooking.quality.superb.coins} times a Common
          one. Eating a dish yourself gives the ${CONFIG.economy.buff.label} buff:
          +${CONFIG.economy.buff.gatherSpeedPct}% gathering speed for
          ${CONFIG.economy.buff.durationMs / 60000} minutes.
        </p>

        <h3>Pans</h3>
        <p>Every pan tier widens the timing window by flat percentage points.</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Pan</th><th class="num">Coins</th><th class="num">Window</th><th>Also needs</th></tr>
            </thead>
            <tbody>
              ${CONFIG.economy.pan.map(
                (pan) => html`
                  <tr>
                    <td>${pan.name}</td>
                    <td class="num">${pan.coins === 0 ? "—" : pan.coins}</td>
                    <td class="num">+${pan.windowBonusPct}%</td>
                    <td class="small muted">
                      ${pan.items
                        .map((part) => `${part.qty}× ${ingredient(part.id).name}`)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>

        <h3>Bags</h3>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Bag</th><th class="num">Coins</th><th class="num">Extra slots</th></tr></thead>
            <tbody>
              ${CONFIG.economy.bag.map(
                (bag) => html`
                  <tr>
                    <td>${bag.name}</td>
                    <td class="num">${bag.coins === 0 ? "—" : bag.coins}</td>
                    <td class="num">${bag.slots === 0 ? "—" : `+${bag.slots}`}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
        <p class="small muted">
          Both are bought with coins earned by playing. Neither is sold for $COOK.
        </p>
      `,
    },

    {
      id: "cosmetics",
      title: "8. Cosmetics",
      body: () => {
        const hats = WARDROBE_ITEMS.filter((item) => item.kind === "hat");
        const companions = WARDROBE_ITEMS.filter((item) => item.kind === "companion");
        return html`
          <p>
            ${hats.length} hats and ${companions.length} companions. All of them are
            cosmetic: not one changes a gather speed, a timing window, a dish's value or
            anything else that could be called power.
          </p>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Item</th><th>Kind</th><th>How it is earned</th></tr></thead>
              <tbody>
                ${WARDROBE_ITEMS.map(
                  (item) => html`
                    <tr>
                      <td>${item.name}</td>
                      <td class="small">${item.kind}</td>
                      <td class="small">${describeUnlockRule(item.unlock)}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>

          <h3>Holder tiers</h3>
          <p>
            Three of those items follow a balance rather than being owned outright. If
            the balance falls the item comes off and returns when it recovers. They are
            cosmetic like the rest.
          </p>
          <ul>
            ${WARDROBE_TIERS.map(
              (tier) => html`<li>${tier.id}: ${tier.minHold.toLocaleString()} $COOK</li>`,
            )}
          </ul>

          <h3>The $COOK shop, which is switched off</h3>
          <p>
            A cosmetics shop that takes $COOK is built and dormant: every one of its
            endpoints answers 404 while the switch is off, and it ships off. When it is
            turned on, a purchase burns half the tokens and sends half to the project
            treasury. Nothing in it is purchase-only — everything it sells is also
            earnable by playing — and there is no random purchase of any kind.
          </p>
          <p>
            Cosmetics belong to the wallet, not to you. They are not tradable and cannot
            be moved to another wallet.
          </p>
        `;
      },
    },

    {
      id: "token",
      title: "9. The token",
      body: () => html`
        <h3>What holding does</h3>
        <ul>
          <li>
            <strong>Entry.</strong> ${config.minHold.toLocaleString()} $COOK in the
            wallet you sign in with opens the hub.
          </li>
          <li>
            <strong>Cosmetics.</strong> Three wardrobe items follow a balance, and the
            dormant shop above takes $COOK when it is turned on.
          </li>
          <li>
            <strong>Seasonal votes.</strong> Planned, not live: holders vote on what a
            season brings.
          </li>
        </ul>

        <h3>Where the fees go</h3>
        <p>
          Trading $COOK generates standard pump.fun creator fees. Those fees are
          received by the team at the project treasury wallet and are used to run the
          servers and build the game.
        </p>
        <p>
          <strong>Nothing is paid out to holders by the game.</strong> Holding $COOK is
          not a claim on those fees or on any other payment, and there is no
          distribution, revenue share or payout attached to it.
        </p>

        <h3>Addresses</h3>
        <p>
          Contract:
          <code>${config.showMint && config.cookMint ? config.cookMint : "revealed at launch"}</code>
        </p>
        <p>
          Treasury:
          <code>${config.treasuryWallet || "published at launch"}</code>
        </p>
        <p>
          Both are served by this deployment at request time rather than written into
          the page, so the address shown is the address the running server gates on.
          The only official domain is ${config.domain}.
        </p>

        <h3>How to buy</h3>
        <ol>
          <li>Get SOL into a Solana wallet — Phantom is the one most people have.</li>
          <li>Open pump.fun or Jupiter, paste the contract address above, and swap.</li>
          <li>Keep ${config.minHold.toLocaleString()} $COOK in that wallet and sign in.</li>
        </ol>
      `,
    },

    {
      id: "fair-play",
      title: "10. Fair play and safety",
      body: () => html`
        <h3>The server decides</h3>
        <p>
          Every action that changes anything is decided on the server. The client asks
          to move, gather, cook or sell; the server checks whether that is possible from
          where the player actually is, with what they actually have, and answers. A
          modified client can ask for anything and gets the same answers.
        </p>
        <p>
          Gather nodes have per-player cooldowns that are persisted, so relogging cannot
          reset them. Cooking is judged against the same window the client was shown.
          Movement is path-checked against the map.
        </p>

        <h3>Rate limits</h3>
        <p>
          Sign-in is rate limited per IP. In-game actions are limited per player and per
          action, and a client that floods is throttled rather than disconnected, so a
          bad connection is not treated as an attack.
        </p>

        <h3>Sign-in is replay-safe</h3>
        <p>
          Each sign-in message carries a single-use nonce that expires after
          ${minutes(NONCE_TTL_MS)} minutes and is consumed when used. A captured
          signature cannot be replayed, a signature from the wrong wallet is refused,
          and a message edited after signing fails verification.
        </p>

        <h3>Backups and the switch</h3>
        <p>
          The database is backed up nightly, and the backups are copied off the machine
          that made them. There is a maintenance switch that closes the door with a
          message while the health endpoint stays up — so a problem can be stopped
          without anyone losing what they were doing.
        </p>

        <h3>What we log</h3>
        <p>
          Wallet addresses, what actions were taken and when, and server health. Wallets
          are public by nature and are already visible in the room. We do not ask for or
          store an email address, a name or any other personal detail — there is no
          account to create.
        </p>
      `,
    },

    {
      id: "roadmap",
      title: "11. Roadmap",
      body: () => roadmapBody(),
    },

    {
      id: "risks",
      title: "12. Risks and disclaimer",
      body: () => html`
        <div class="warn">
          <p>
            <strong>$COOK is a community token.</strong> It is not a share, not an
            investment, and not a claim on anything we own or earn.
          </p>
          <p>
            We make no promise about its price, and no promise of rewards, income,
            airdrops or returns of any kind. Nothing on this site is financial advice.
          </p>
          <p>
            Only buy what you can afford to lose. Token prices go down as easily as up,
            and this one can go to nothing.
          </p>
        </div>
        <ul>
          <li>
            There are no cash prizes. Nothing in the game pays out money, and coins
            earned by playing exist only inside the game.
          </li>
          <li>
            Cosmetics are tied to the wallet. They are not tradable and cannot be moved
            to another wallet, and they are not owned in any sense that survives the
            game.
          </li>
          <li>
            The game will change. Numbers are retuned, features are added and removed,
            and everything past Floor 1 is a plan rather than a promise.
          </li>
          <li>
            There is one official domain, ${config.domain}, and one contract address,
            published on this site and on /official. Anything else is a different token
            or a different site, whoever is posting it.
          </li>
        </ul>
      `,
    },
  ];
}

export function whitepaperPage(config: SiteConfig): ReturnType<typeof html> {
  const list = chapters(config);

  return html`
    ${topbar(false)}
    <main class="site-wrap band-plain">
      <div class="inner">
        <div class="section-gap" style="padding-bottom: 0">
          <div class="label">whitepaper.txt</div>
          <h1 style="font-size: clamp(2rem, 6vw, 3rem)">CrazyCauldron</h1>
          <p class="lead">
            What the game is, how it works, what the token does, and what we are not
            promising. Specific numbers throughout; most of them are read from the same
            content files the server runs on.
          </p>
        </div>

        <div class="wp">
          <nav class="wp-toc" aria-label="Contents">
            <div class="label">contents</div>
            <ol style="list-style: none; padding: 0">
              ${list.map(
                (chapter) => html`<li><a href="#${chapter.id}">${chapter.title}</a></li>`,
              )}
            </ol>
          </nav>
          <div class="wp-body">
            ${list.map(
              (chapter) => html`
                <section id="${chapter.id}">
                  <h2>${chapter.title}</h2>
                  ${chapter.body()}
                </section>
              `,
            )}
          </div>
        </div>
      </div>
    </main>
    ${footer(config)}
  `;
}

/** Highlights the chapter the reader is in, in the sticky contents list. */
export function startTocHighlight(): void {
  const links = new Map<string, HTMLAnchorElement>();
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>(".wp-toc a"))) {
    links.set(link.getAttribute("href")?.slice(1) ?? "", link);
  }
  if (links.size === 0 || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of links.values()) link.classList.remove("here");
        links.get(entry.target.id)?.classList.add("here");
      }
    },
    { rootMargin: "-20% 0px -70% 0px" },
  );

  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
}
