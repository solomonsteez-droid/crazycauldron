/**
 * Buying a cosmetic with $COOK.
 *
 * The shape of the deal: a fixed price per item, half of it burned and half
 * sent to the treasury. The server never touches the tokens and never holds a
 * key - it builds an unsigned transaction, the player's wallet signs it, and
 * the server then reads the chain to decide whether anything is owed.
 *
 * That second half is the part that matters. A client that says "I paid" is
 * not evidence; a finalized transaction that burned the right amount of the
 * right mint and paid the right treasury is. Everything below exists to make
 * the difference between those two checkable, including the one nobody
 * remembers until it happens: the same transaction presented twice.
 *
 * Off by default. SHOP_ENABLED has to be true for any of it to be reachable.
 */

import {
  createBurnCheckedInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  Transaction,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { shopPrice } from "@crazycauldron/shared";
import { config } from "../config.js";
import { log } from "../logger.js";

/** Lazily dialled, so importing this module never opens a connection. */
let connection: Connection | null = null;
function rpc(): Connection {
  if (!connection) connection = new Connection(config.rpcUrl, "confirmed");
  return connection;
}

export interface Quote {
  itemId: string;
  /** Whole $COOK the player pays. */
  cook: number;
  /** The half that is destroyed. */
  burn: number;
  /** The half the treasury receives. */
  treasuryCook: number;
  treasuryWallet: string;
  mint: string;
  /** Base64 of the unsigned transaction, for the wallet to sign. */
  transaction: string;
  /** The player's balance now, and what they would have afterwards. */
  balance: number;
  balanceAfter: number;
  minHold: number;
  /**
   * True when paying would leave them below MIN_HOLD - which does not block
   * the purchase, but does mean they would be shut out of the hub afterwards.
   */
  dropsBelowMinHold: boolean;
}

export class ShopError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Refuses everything unless the shop has been deliberately switched on. */
export function assertShopEnabled(): void {
  if (!config.shopEnabled) {
    throw new ShopError("shop_disabled", "The $COOK shop is not open yet.");
  }
}

/**
 * Builds the transaction the buyer's wallet will be asked to sign.
 *
 * Two instructions, both `Checked` variants: those carry the mint and the
 * decimals in the instruction itself, so a wallet showing the player what they
 * are about to approve can show the real token and the real amount rather than
 * a raw number. It also means the chain rejects a mismatch instead of the
 * server having to notice one.
 *
 * Unsigned and unspent: this hands back bytes. Nothing has happened until the
 * player signs and submits, and nothing is granted until the chain says so.
 */
export async function quote(wallet: string, itemId: string, balance: number): Promise<Quote> {
  assertShopEnabled();

  const cook = shopPrice(itemId);
  if (cook === undefined) {
    throw new ShopError("unknown_item", "That is not for sale.");
  }
  if (cook % 2 !== 0) {
    // A catalogue mistake, not a player one: an odd price cannot be halved
    // into two whole amounts, and silently rounding would lose a token.
    throw new ShopError("bad_price", "That item is priced oddly. Please report this.");
  }

  const buyer = new PublicKey(wallet);
  const mint = new PublicKey(config.cookMint);
  const treasury = new PublicKey(config.treasuryWallet);

  const { decimals } = await getMint(rpc(), mint);
  const unit = 10n ** BigInt(decimals);
  const half = BigInt(cook / 2) * unit;

  const from = await getAssociatedTokenAddress(mint, buyer);
  const to = await getAssociatedTokenAddress(mint, treasury);

  const transaction = new Transaction();
  transaction.add(
    createBurnCheckedInstruction(from, mint, buyer, half, decimals, [], TOKEN_PROGRAM_ID),
  );
  transaction.add(
    createTransferCheckedInstruction(from, mint, to, buyer, half, decimals, [], TOKEN_PROGRAM_ID),
  );

  /*
   * The buyer pays the network fee and signs. A blockhash is fetched so the
   * wallet has a complete transaction to show and sign; if it goes stale
   * before they get round to it, the chain rejects it and they ask again -
   * which is the correct outcome, not a bug to work around.
   */
  transaction.feePayer = buyer;
  transaction.recentBlockhash = (await rpc().getLatestBlockhash("finalized")).blockhash;

  const balanceAfter = balance - cook;
  return {
    itemId,
    cook,
    burn: cook / 2,
    treasuryCook: cook / 2,
    treasuryWallet: config.treasuryWallet,
    mint: config.cookMint,
    transaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    balance,
    balanceAfter,
    minHold: config.minHold,
    dropsBelowMinHold: balanceAfter < config.minHold,
  };
}

export interface Settlement {
  itemId: string;
  cook: number;
  signature: string;
}

/** A parsed SPL-token instruction, which is the only kind this reads. */
interface TokenInstruction {
  type: string;
  info: Record<string, unknown>;
}

function tokenInstructions(tx: ParsedTransactionWithMeta): TokenInstruction[] {
  const all: (ParsedInstruction | PartiallyDecodedInstruction)[] = [
    ...tx.transaction.message.instructions,
    // Anything a program invoked on the caller's behalf counts too: a burn
    // does not stop being a burn because it happened inside a CPI.
    ...(tx.meta?.innerInstructions ?? []).flatMap((inner) => inner.instructions),
  ];

  const found: TokenInstruction[] = [];
  for (const instruction of all) {
    if (!("parsed" in instruction)) continue;
    if (instruction.program !== "spl-token") continue;
    const parsed = instruction.parsed as { type?: string; info?: Record<string, unknown> };
    if (!parsed?.type || !parsed.info) continue;
    found.push({ type: parsed.type, info: parsed.info });
  }
  return found;
}

/** The raw token amount an instruction moved, whichever field carries it. */
function amountOf(info: Record<string, unknown>): bigint {
  const direct = info.amount;
  if (typeof direct === "string") return BigInt(direct);
  const checked = info.tokenAmount as { amount?: string } | undefined;
  if (checked?.amount) return BigInt(checked.amount);
  return 0n;
}

/**
 * Decides whether a signature actually paid for an item.
 *
 * Six things have to be true, and each of them is a way somebody has tried to
 * get something for nothing somewhere:
 *
 *  - the transaction exists and is finalized, not merely seen;
 *  - it succeeded, because a failed transaction still has a signature;
 *  - the buyer signed it, so a stranger's payment cannot be claimed;
 *  - the mint is $COOK, not a token minted this morning with the same name;
 *  - half the price was burned and half reached the treasury's own account;
 *  - and nobody has claimed this signature before.
 *
 * The last is the caller's job - it needs the database - so this returns what
 * it verified and leaves the recording to the endpoint.
 */
export async function verifyPayment(
  wallet: string,
  itemId: string,
  signature: string,
): Promise<Settlement> {
  assertShopEnabled();

  const cook = shopPrice(itemId);
  if (cook === undefined) throw new ShopError("unknown_item", "That is not for sale.");

  const tx = await rpc().getParsedTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    /*
     * Not found at finalized commitment means one of two things - it has not
     * finalized yet, or it never existed - and the honest answer is the same
     * either way: come back when the chain agrees it happened.
     */
    throw new ShopError(
      "not_finalized",
      "That payment has not finalized yet. Try again in a moment.",
    );
  }
  if (tx.meta?.err) {
    throw new ShopError("failed", "That transaction failed on-chain, so nothing was paid.");
  }

  const signers = tx.transaction.message.accountKeys
    .filter((key) => key.signer)
    .map((key) => key.pubkey.toBase58());
  if (!signers.includes(wallet)) {
    throw new ShopError("not_yours", "That payment was not signed by your wallet.");
  }

  const mint = config.cookMint;
  const { decimals } = await getMint(rpc(), new PublicKey(mint));
  const half = BigInt(cook / 2) * 10n ** BigInt(decimals);

  const instructions = tokenInstructions(tx);

  const burned = instructions
    .filter((i) => (i.type === "burn" || i.type === "burnChecked") && i.info.mint === mint)
    .reduce((total, i) => total + amountOf(i.info), 0n);
  if (burned < half) {
    throw new ShopError("short_burn", "That payment did not burn the right amount of $COOK.");
  }

  /*
   * The treasury's own token account for this mint, derived rather than
   * trusted: a transfer to some other account the treasury happens to control
   * is not the one we asked for, and a transfer to an account somebody else
   * named "treasury" is certainly not.
   */
  const treasuryAccount = (
    await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(config.treasuryWallet))
  ).toBase58();

  const paid = instructions
    .filter(
      (i) =>
        (i.type === "transfer" || i.type === "transferChecked") &&
        i.info.destination === treasuryAccount &&
        // A plain `transfer` carries no mint, so the destination account is
        // checked against the chain instead of taken on trust.
        (i.info.mint === undefined || i.info.mint === mint),
    )
    .reduce((total, i) => total + amountOf(i.info), 0n);

  if (paid < half) {
    throw new ShopError("short_payment", "That payment did not reach the treasury in full.");
  }

  // A plain transfer named no mint, so confirm the destination really is a
  // $COOK account before accepting it as payment in $COOK.
  const account = await getAccount(rpc(), new PublicKey(treasuryAccount));
  if (account.mint.toBase58() !== mint) {
    throw new ShopError("wrong_mint", "That payment was in the wrong token.");
  }

  log.info("shop.verified", { wallet, itemId, signature, cook });
  return { itemId, cook, signature };
}
