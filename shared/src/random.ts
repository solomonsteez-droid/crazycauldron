/**
 * A small seeded generator, shared because two very different things need the
 * same one: the server decides which villagers a room gets, and the client
 * decides where a map's scenery stands. Neither may use Math.random - a hub
 * that reshuffles its residents on restart, or a tree that moves when you
 * travel and come back, reads as a bug even though nothing is at stake.
 *
 * mulberry32: 32 bits of state, good enough for scattering shrubs and far
 * cheaper than anything with a real name. Not for anything a player could gain
 * from predicting - rewards are rolled on the server with Math.random.
 */

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit seed from a string, so a room id can seed a town. */
export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
