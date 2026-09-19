/**
 * The $COOK shop, against a real devnet mint.
 *
 *   npx tsx scripts/test-shop.ts
 *
 * Two halves. First that the shop is genuinely off: with SHOP_ENABLED unset,
 * every route answers as though it does not exist, which is the state this
 * ships in. Then, with it switched on and pointed at devnet, that the
 * transaction it builds is the one it claims to build - right mint, right
 * decimals, half burned, half to the treasury's own token account, buyer
 * paying the fee - and that the settlement refuses everything it should.
 *
 * What it does not do is complete a purchase. That needs a devnet wallet with
 * SOL in it, and the public faucet has nothing to give; the airdrop endpoint
 * answers "the faucet has run dry". So the last step - sign, submit, claim -
 * is the one piece that has to be done by hand before the shop is switched on
 * for real. Everything up to it, and every way it can be cheated, is here.
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { openDatabase, SqlitePlayerRepository } from "../server/src/db/sqlite.js";
import { SqliteGameRepository } from "../server/src/db/gameRepo.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import nacl from "tweetnacl";
import bs58 from "bs58";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const PORT = 2591;
const HTTP = `http://localhost:${PORT}`;
const DEVNET = "https://api.devnet.solana.com";

/** Wrapped SOL: a real mint that exists on devnet, standing in for $COOK. */
const DEVNET_MINT = "So11111111111111111111111111111111111111112";
/** A throwaway treasury. The real one lives in the deployment's env. */
const TREASURY = Keypair.generate().publicKey.toBase58();

/** A real, finalized devnet transaction that has nothing to do with us. */
const SOMEONE_ELSES =
  "48qEetfosvjquiAnpVZ7f61KdWYxTuwHWFWKyAAcdQdxbJHDJ75p91EFF5L3oxWyD8jtyaZ1VwL1oERnYGu3XMWH";

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let serverOutput = "";

async function startServer(env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "src/index.ts"], {
    cwd: path.join(ROOT, "server"),
    shell: process.platform === "win32",
    env: {
      ...process.env,
      PORT: String(PORT),
      TEST_BYPASS_HOLD: "true",
      AUTH_RATE_LIMIT: "500",
      NODE_ENV: "development",
      RPC_URL: DEVNET,
      COOK_MINT: DEVNET_MINT,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverOutput = "";
  child.stdout?.on("data", (chunk: Buffer) => (serverOutput += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (serverOutput += chunk.toString()));

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(500);
    try {
      if ((await fetch(`${HTTP}/health`)).ok) return child;
    } catch {
      // Not up yet.
    }
  }
  child.kill("SIGKILL");
  throw new Error(`the server never came up:\n${serverOutput.slice(-2000)}`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  /*
   * On Windows the child is a cmd.exe wrapper around npx, which is in turn a
   * wrapper around node. Killing the one we have a handle on leaves the node
   * process holding the port, and the next server silently fails to bind
   * while the old one keeps answering - which looks exactly like a passing
   * test of the wrong thing. taskkill /T takes the tree.
   */
  if (process.platform === "win32" && child.pid) {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    child.kill("SIGKILL");
  }
  await sleep(1500);
}

/** A throwaway wallet with a live session token. */
async function signIn(): Promise<{ token: string; wallet: string; keypair: nacl.SignKeyPair }> {
  const keypair = nacl.sign.keyPair();
  const wallet = bs58.encode(keypair.publicKey);

  const { message } = (await (await fetch(`${HTTP}/auth/nonce?address=${wallet}`)).json()) as {
    message: string;
  };
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey),
  );
  const body = (await (
    await fetch(`${HTTP}/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: wallet, message, signature }),
    })
  ).json()) as { token?: string };

  if (!body.token) throw new Error(`sign-in failed: ${JSON.stringify(body)}`);
  return { token: body.token, wallet, keypair };
}

function authed(token: string, body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  };
}

async function main(): Promise<void> {
  console.log("test-shop\n");
  let server: ChildProcess | null = null;

  try {
    // --- the shop as it ships ---------------------------------------------
    console.log("-- switched off --");
    server = await startServer({ SHOP_ENABLED: "false" });

    const closed = (await (await fetch(`${HTTP}/shop/items`)).json()) as {
      enabled: boolean;
      items: unknown[];
      treasuryWallet: string | null;
    };
    check("the catalogue says it is closed", closed.enabled === false);
    check("and lists nothing", closed.items.length === 0);
    check("and does not name the treasury", closed.treasuryWallet === null);

    const off = await signIn();
    const quoteOff = await fetch(`${HTTP}/shop/quote`, authed(off.token, { itemId: "hat_01_chef" }));
    check("a quote is not found", quoteOff.status === 404, String(quoteOff.status));

    const claimOff = await fetch(
      `${HTTP}/shop/claim`,
      authed(off.token, { itemId: "hat_01_chef", signature: SOMEONE_ELSES }),
    );
    check("nor is a claim", claimOff.status === 404, String(claimOff.status));

    await stopServer(server);

    // --- switched on, against devnet --------------------------------------
    console.log("\n-- switched on, on devnet --");
    server = await startServer({ SHOP_ENABLED: "true", TREASURY_WALLET: TREASURY });

    const open = (await (await fetch(`${HTTP}/shop/items`)).json()) as {
      enabled: boolean;
      items: { itemId: string; cook: number; name: string }[];
      treasuryWallet: string;
    };
    check("the catalogue opens", open.enabled === true);
    check("with items priced in $COOK", open.items.length > 0, `${open.items.length} item(s)`);
    check(
      "every price is even, so it halves cleanly",
      open.items.every((i) => i.cook % 2 === 0),
    );
    check("and each carries the wardrobe name", open.items.every((i) => i.name !== i.itemId));

    const buyer = await signIn();
    const item = open.items[0]!;

    const res = await fetch(`${HTTP}/shop/quote`, authed(buyer.token, { itemId: item.itemId }));
    const built = (await res.json()) as {
      cook: number;
      burn: number;
      treasuryCook: number;
      transaction: string;
      balance: number;
      balanceAfter: number;
      minHold: number;
      dropsBelowMinHold: boolean;
    };
    check("a quote is built", res.ok, String(res.status));
    check("priced as the catalogue says", built.cook === item.cook, String(built.cook));
    check(
      "split in half, burn and treasury",
      built.burn === item.cook / 2 && built.treasuryCook === item.cook / 2,
      `${built.burn} + ${built.treasuryCook}`,
    );

    // --- what the wallet would actually be signing -------------------------
    console.log("\n-- the transaction itself --");
    const tx = Transaction.from(Buffer.from(built.transaction, "base64"));

    check("it is unsigned", tx.signatures.every((s) => s.signature === null));
    check("the buyer pays the fee", tx.feePayer?.toBase58() === buyer.wallet, String(tx.feePayer));
    check("it carries a blockhash", Boolean(tx.recentBlockhash));
    check("two instructions, no more", tx.instructions.length === 2, String(tx.instructions.length));

    /*
     * Checked variants carry the mint and the decimals in the instruction, so
     * a wallet can show the player the real token and the real amount - and
     * the chain rejects a mismatch rather than leaving it to be noticed later.
     */
    const [burnIx, transferIx] = tx.instructions;
    check("the first burns", burnIx?.data[0] === 15, `opcode ${burnIx?.data[0]}`);
    check("the second transfers", transferIx?.data[0] === 12, `opcode ${transferIx?.data[0]}`);

    const mint = new PublicKey(DEVNET_MINT);
    const buyerAta = await getAssociatedTokenAddress(mint, new PublicKey(buyer.wallet));
    const treasuryAta = await getAssociatedTokenAddress(mint, new PublicKey(TREASURY));

    check(
      "both spend the buyer's own token account",
      burnIx?.keys[0]?.pubkey.equals(buyerAta) === true &&
        transferIx?.keys[0]?.pubkey.equals(buyerAta) === true,
    );
    check("the burn names the $COOK mint", burnIx?.keys[1]?.pubkey.equals(mint) === true);
    check(
      "the transfer lands in the treasury's own $COOK account",
      transferIx?.keys[2]?.pubkey.equals(treasuryAta) === true,
    );

    // Amount is a little-endian u64 after the one-byte opcode; wSOL has nine
    // decimals, so half the price in whole tokens is that many base units.
    const half = BigInt(item.cook / 2) * 10n ** 9n;
    check(
      "and each moves exactly half the price",
      burnIx!.data.readBigUInt64LE(1) === half && transferIx!.data.readBigUInt64LE(1) === half,
      `${burnIx!.data.readBigUInt64LE(1)}`,
    );

    // --- the warning -------------------------------------------------------
    console.log("\n-- the min-hold warning --");
    check(
      "a wallet holding nothing is warned it would fall below MIN_HOLD",
      built.dropsBelowMinHold === true,
      `${built.balance} -> ${built.balanceAfter}, min ${built.minHold}`,
    );

    // --- settling ----------------------------------------------------------
    console.log("\n-- what settlement refuses --");
    const unknown = await fetch(
      `${HTTP}/shop/claim`,
      authed(buyer.token, { itemId: item.itemId, signature: bs58.encode(nacl.randomBytes(64)) }),
    );
    check(
      "a signature the chain has never seen is not settled",
      unknown.status === 202,
      String(unknown.status),
    );

    const stranger = await fetch(
      `${HTTP}/shop/claim`,
      authed(buyer.token, { itemId: item.itemId, signature: SOMEONE_ELSES }),
    );
    const strangerBody = (await stranger.json()) as { error: string };
    check(
      "somebody else's real transaction is refused",
      stranger.status === 400 && strangerBody.error === "not_yours",
      `${stranger.status} ${strangerBody.error}`,
    );

    const noSignature = await fetch(
      `${HTTP}/shop/claim`,
      authed(buyer.token, { itemId: item.itemId, signature: "" }),
    );
    check("and a claim with no signature is refused", noSignature.status === 400);

    const notSold = await fetch(
      `${HTTP}/shop/quote`,
      authed(buyer.token, { itemId: "hat_09_gold" }),
    );
    check(
      "a tier garment is not for sale at any price",
      notSold.status === 404,
      String(notSold.status),
    );

    /*
     * Replay, which cannot be reached through the endpoint without a real
     * payment, is checked one layer down instead. It is the write that makes
     * a claim exclusive, so the write is what has to be exclusive.
     */
    console.log("\n-- the same payment, twice --");
    const ledgerDb = openDatabase(":memory:");
    const ledger = new SqliteGameRepository(ledgerDb);
    await new SqlitePlayerRepository(ledgerDb).upsertOnLogin(buyer.wallet, "Buyer");

    const purchase = {
      signature: SOMEONE_ELSES,
      wallet: buyer.wallet,
      itemId: item.itemId,
      cook: item.cook,
      at: new Date().toISOString(),
    };
    const firstClaim = await ledger.claimPurchase(purchase);
    const secondClaim = await ledger.claimPurchase(purchase);
    check("the first claim grants the item", firstClaim.granted === true);
    check("the second grants nothing", secondClaim.granted === false);

    const state = await ledger.load(buyer.wallet);
    check(
      "and the item was granted exactly once",
      state.unlockedItems.filter((id) => id === item.itemId).length === 1,
      state.unlockedItems.join(", "),
    );
    check("with one row in the ledger", (await ledger.purchasesOf(buyer.wallet)).length === 1);
    ledgerDb.close();

    console.log("\n-- what is left for a human --");
    console.log("    sign one quote with a funded devnet wallet, submit it, and claim it;");
    console.log("    then claim it a second time and confirm the 409.");
  } catch (err) {
    console.error("\n-- the server said --");
    console.error(serverOutput.slice(-3000));
    throw err;
  } finally {
    if (server) await stopServer(server);
  }

  console.log(`\ntest-shop: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

await main();
