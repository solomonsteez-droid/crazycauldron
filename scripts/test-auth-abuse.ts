/**
 * Every way a sign-in can be attacked, tried against a running server.
 *
 *   npm run dev                       # in another terminal
 *   npx tsx scripts/test-auth-abuse.ts
 *
 * The happy path is already covered by the smoke test. This is the other half:
 * a replayed signature, a nonce used twice, a nonce left to go stale, a
 * signature from the wrong wallet, a message edited after signing, and tokens
 * that are malformed, forged or expired. Each must be refused, and each must
 * leave a reason in the log - a rejection nobody can explain afterwards is only
 * half a defence.
 *
 * Nothing here needs a wallet with $COOK: every case is expected to fail before
 * the token gate is ever consulted.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Keypair } from "@solana/web3.js";
import { Client } from "colyseus.js";
import bs58 from "bs58";
import jwt from "jsonwebtoken";
import nacl from "tweetnacl";
import { ROOM_HUB, type NonceResponse } from "@crazycauldron/shared";

// The same .env the server read, so the forged-token cases can sign with the
// real key and prove that expiry - not the signature - is what refuses them.
loadEnv({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const HTTP = process.env.SMOKE_HTTP_URL ?? "http://localhost:2567";
const WS = process.env.SMOKE_WS_URL ?? "ws://localhost:2567";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

interface Attempt {
  status: number;
  body: { error?: string; message?: string; token?: string };
}

async function nonceFor(address: string): Promise<NonceResponse> {
  const response = await fetch(`${HTTP}/auth/nonce?address=${address}`);
  if (!response.ok) throw new Error(`nonce ${response.status}`);
  return (await response.json()) as NonceResponse;
}

async function verify(address: string, message: string, signature: string): Promise<Attempt> {
  const response = await fetch(`${HTTP}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, message, signature }),
  });
  return { status: response.status, body: (await response.json()) as Attempt["body"] };
}

const sign = (keypair: Keypair, message: string) =>
  bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey));

/** A wallet that has proved itself and holds a real session token. */
async function signIn(): Promise<{ address: string; token: string }> {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const { message } = await nonceFor(address);
  const attempt = await verify(address, message, sign(keypair, message));
  if (attempt.status !== 200 || !attempt.body.token) {
    throw new Error(`could not sign in cleanly: ${attempt.status} ${attempt.body.error}`);
  }
  return { address, token: attempt.body.token };
}

/** Tries to take a hub seat with a token, and reports how it was refused. */
async function joinWith(token: string): Promise<{ joined: boolean; code?: number; message?: string }> {
  try {
    const room = await new Client(WS).joinOrCreate(ROOM_HUB, { token });
    await room.leave();
    return { joined: true };
  } catch (err) {
    const error = err as { code?: number; message?: string };
    return { joined: false, code: error.code, message: error.message };
  }
}

async function main() {
  console.log("test-auth-abuse\n");

  // --- a clean sign-in, so the rest has something to compare against -------
  console.log("-- baseline --");
  {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const { message } = await nonceFor(address);
    const attempt = await verify(address, message, sign(keypair, message));
    check("an honest sign-in is accepted", attempt.status === 200, `${attempt.status}`);
    check("and comes back with a token", typeof attempt.body.token === "string");
  }

  // --- replay --------------------------------------------------------------
  console.log("\n-- replay and nonce reuse --");
  {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const { message } = await nonceFor(address);
    const signature = sign(keypair, message);

    const first = await verify(address, message, signature);
    check("the first use of a nonce works", first.status === 200, `${first.status}`);

    // Byte for byte the same request, which is what a replay is.
    const second = await verify(address, message, signature);
    check(
      "replaying the identical signature is refused",
      second.status === 401,
      `${second.status} ${second.body.error ?? ""}`,
    );
    check("and hands back no token", second.body.token === undefined);
  }

  {
    // A second, differently-signed request against a nonce already spent.
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const { message } = await nonceFor(address);
    await verify(address, message, sign(keypair, message));

    const again = await verify(address, message, sign(keypair, message));
    check("a spent nonce cannot be used again", again.status === 401, `${again.status}`);
  }

  // --- a nonce the server has never issued ---------------------------------
  {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const { message } = await nonceFor(address);
    const invented = message.replace(/Nonce: .*/, "Nonce: 0000000000000000000000000000000000000000");
    const attempt = await verify(address, invented, sign(keypair, invented));
    check("an invented nonce is refused", attempt.status === 401, `${attempt.status}`);
  }

  // --- a message issued too long ago ---------------------------------------
  console.log("\n-- stale and tampered messages --");
  {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const { message } = await nonceFor(address);
    // Two hours old: well past NONCE_TTL_MS, and signed properly, so only the
    // timestamp check can catch it.
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const stale = message.replace(/Issued At: .*/, `Issued At: ${old}`);
    const attempt = await verify(address, stale, sign(keypair, stale));
    check("a message issued two hours ago is refused", attempt.status === 401, `${attempt.status}`);
  }

  {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const { message } = await nonceFor(address);
    // The domain is what a phishing page would change; the server re-renders
    // the message from its own configuration and compares.
    const tampered = message.replace(/^[^\n]*/, "evil.example.com wants you to sign in");
    const attempt = await verify(address, tampered, sign(keypair, tampered));
    check("a message edited after signing is refused", attempt.status === 401, `${attempt.status}`);
  }

  {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const { message } = await nonceFor(address);
    const attempt = await verify(address, message, sign(keypair, `${message}\nand one more thing`));
    check(
      "a signature over different text is refused",
      attempt.status === 401,
      `${attempt.status}`,
    );
  }

  // --- the wrong wallet ----------------------------------------------------
  console.log("\n-- wrong wallet --");
  {
    const claimed = Keypair.generate();
    const signer = Keypair.generate();
    const address = claimed.publicKey.toBase58();
    const { message } = await nonceFor(address);

    // Valid signature, valid nonce, valid message - but not from the wallet
    // the message names.
    const attempt = await verify(address, message, sign(signer, message));
    check("a signature from another wallet is refused", attempt.status === 401, `${attempt.status}`);
  }

  {
    const keypair = Keypair.generate();
    const other = Keypair.generate();
    const { message } = await nonceFor(keypair.publicKey.toBase58());
    // The message names one address; the request claims another.
    const attempt = await verify(other.publicKey.toBase58(), message, sign(other, message));
    check(
      "an address that disagrees with the message is refused",
      attempt.status === 401,
      `${attempt.status}`,
    );
  }

  {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const { message } = await nonceFor(address);
    const attempt = await verify(address, message, "not-base58-at-all!!");
    check("a malformed signature is refused", attempt.status === 401, `${attempt.status}`);
  }

  {
    const response = await fetch(`${HTTP}/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: 42 }),
    });
    check("a request missing its fields is refused", response.status === 400, `${response.status}`);
  }

  // --- tokens --------------------------------------------------------------
  console.log("\n-- tokens --");
  {
    const good = await signIn();
    const joined = await joinWith(good.token);
    check("a real token takes a seat", joined.joined, joined.message ?? "");
  }

  {
    const joined = await joinWith("this-is-not-a-jwt");
    check("a malformed token is refused a seat", !joined.joined, `code ${joined.code}`);
  }

  {
    // Correctly shaped and correctly signed - with the wrong key.
    const forged = jwt.sign({ wallet: "attacker", displayName: "attacker" }, "the-wrong-secret", {
      subject: "attacker",
      expiresIn: 3600,
      algorithm: "HS256",
    });
    const joined = await joinWith(forged);
    check("a token signed with another key is refused", !joined.joined, `code ${joined.code}`);
  }

  {
    // Signed with no key at all, which is the classic algorithm-confusion try.
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(
      JSON.stringify({ sub: "attacker", wallet: "attacker" }),
    ).toString("base64url")}.`;
    const joined = await joinWith(unsigned);
    check('an "alg: none" token is refused', !joined.joined, `code ${joined.code}`);
  }

  {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.log("  skip  expired token - JWT_SECRET is not in this shell's environment");
    } else {
      const expired = jwt.sign({ wallet: "ghost", displayName: "ghost" }, secret, {
        subject: "ghost",
        expiresIn: -60,
        algorithm: "HS256",
      });
      const joined = await joinWith(expired);
      check("an expired token is refused", !joined.joined, `code ${joined.code}`);
    }
  }

  {
    const response = await fetch(`${HTTP}/play/enter`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer nonsense" },
    });
    check("entering with a bad token is refused", response.status === 401, `${response.status}`);
  }

  {
    const response = await fetch(`${HTTP}/play/enter`, { method: "POST" });
    check("entering with no token at all is refused", response.status === 401, `${response.status}`);
  }

  console.log(
    `\n${failures === 0 ? "test-auth-abuse: OK" : `test-auth-abuse: ${failures} failure(s)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\ntest-auth-abuse failed: ${(err as Error).message}`);
  process.exit(1);
});
