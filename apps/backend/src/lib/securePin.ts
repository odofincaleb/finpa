import { randomInt } from "crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Crypto-secure alphanumeric chunk for activation PIN codes. */
export function randomPinChunk(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)]!;
  }
  return out;
}

export function generateActivationCode(): string {
  return `FINPA-${randomPinChunk()}-${randomPinChunk()}`;
}

/** Demo / review PINs are off unless explicitly enabled. */
export function allowDemoPins(): boolean {
  return process.env.ALLOW_DEMO_PINS === "true";
}

export function isDemoPinCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith("FINPA-DEMO-");
}
