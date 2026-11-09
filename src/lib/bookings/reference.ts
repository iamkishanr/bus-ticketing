import { randomInt } from "node:crypto";

// Crockford base32 without I, L, O, U to avoid transcription errors.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** R10/R19: the reference is the sole retrieval credential, so it needs real entropy. */
export function newReference(): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
