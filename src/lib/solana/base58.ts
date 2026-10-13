/**
 * Minimal base58 (Bitcoin alphabet) encoder, shared by client and server.
 *
 * Why this exists instead of a dependency: the only thing Bagwork needs base58 for is
 * turning the raw 64-byte signature that Privy returns into the `txSignature` string that
 * the API stores and Solscan links to. The obvious `bs58` package is a *transitive*
 * dependency of `@solana/web3.js` here, and importing it directly would break under a
 * hoisting change — while `@solana/kit` does not re-export the codecs we would need.
 * Twenty lines, no dependencies, and verified against `bs58` for random inputs.
 *
 * Alphabet: `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`
 * (no `0`, `O`, `I`, `l` — exactly what `/^[1-9A-HJ-NP-Za-km-z]+$/` asserts elsewhere).
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Encodes bytes as a base58 string. Leading zero bytes become leading `1`s. */
export function base58Encode(input: Uint8Array): string {
  if (input.length === 0) return "";

  // Count leading zeros — base58 has no zero digit, so each becomes a literal "1".
  let zeros = 0;
  while (zeros < input.length && input[zeros] === 0) zeros++;

  // Big-integer division in base 256, emitting base58 digits least-significant first.
  const digits: number[] = [];
  for (let i = zeros; i < input.length; i++) {
    let carry = input[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = (carry - digits[j]) / 58;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry - (carry % 58)) / 58;
    }
  }

  let result = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }
  return result;
}

/** Decodes a base58 string back to bytes. Throws on a character outside the alphabet. */
export function base58Decode(value: string): Uint8Array {
  if (value.length === 0) return new Uint8Array();

  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros++;

  const bytes: number[] = [];
  for (let i = zeros; i < value.length; i++) {
    const digit = ALPHABET.indexOf(value[i]);
    if (digit === -1) throw new Error(`Invalid base58 character: ${value[i]}`);
    let carry = digit;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[zeros + bytes.length - 1 - i] = bytes[i];
  }
  return out;
}
