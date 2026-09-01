import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEYLEN = 64;

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 10) {
    throw new Error("PASSWORD_TOO_SHORT");
  }
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, KEYLEN, {
    cost: COST,
    blockSize: BLOCK_SIZE,
    parallelization: PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, encoded) {
  try {
    const [kind, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw] = String(encoded || "").split("$");
    if (kind !== "scrypt" || !saltRaw || !hashRaw) return false;

    const cost = Number(costRaw);
    const blockSize = Number(blockRaw);
    const parallelization = Number(parallelRaw);
    const expected = Buffer.from(hashRaw, "base64url");
    const actual = Buffer.from(await scryptAsync(
      String(password),
      Buffer.from(saltRaw, "base64url"),
      expected.length,
      {
        cost,
        blockSize,
        parallelization,
        maxmem: 64 * 1024 * 1024,
      }
    ));

    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
