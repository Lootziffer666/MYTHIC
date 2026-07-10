import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config";

/**
 * Local, at-rest encryption for sensitive settings (LLM API keys).
 *
 * DSGVO / privacy guarantees:
 *  - Nothing leaves the machine. No telemetry, no network calls here.
 *  - The master key is derived from MYTHIC_MASTER_KEY (or a per-install file
 *    written once under the work dir) and never persisted in plaintext logs.
 *  - AES-256-GCM with a random 12-byte IV + auth tag per value.
 */

const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;

function masterKeyPath(): string {
  return path.join(CONFIG.workDir, ".mythic-master-key");
}

function loadMasterKey(): Buffer {
  const fromEnv = process.env.MYTHIC_MASTER_KEY?.trim();
  if (fromEnv) {
    // Accept either a 64-hex-char key or any passphrase (hashed to 32 bytes).
    if (/^[0-9a-f]{64}$/i.test(fromEnv)) return Buffer.from(fromEnv, "hex");
    return crypto.createHash("sha256").update(fromEnv, "utf8").digest();
  }
  // Deterministic per-install key stored on disk (chmod 600). Generated once.
  const file = masterKeyPath();
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
  const key = crypto.randomBytes(KEY_BYTES);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  return key;
}

let MASTER: Buffer | null = null;
function key(): Buffer {
  if (!MASTER) MASTER = loadMasterKey();
  return MASTER;
}

export interface EncryptedValue {
  iv: string;
  tag: string;
  data: string;
}

/** Encrypt a UTF-8 string. Returns the components needed to decrypt. */
export function encrypt(plain: string): EncryptedValue {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("hex"), tag: tag.toString("hex"), data: data.toString("hex") };
}

/** Decrypt an EncryptedValue back to a UTF-8 string. */
export function decrypt(v: EncryptedValue): string {
  const iv = Buffer.from(v.iv, "hex");
  const tag = Buffer.from(v.tag, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(Buffer.from(v.data, "hex")), decipher.final()]);
  return out.toString("utf8");
}

/** True once a master key exists (helps the UI show "encrypted at rest"). */
export function encryptionReady(): boolean {
  return !!process.env.MYTHIC_MASTER_KEY || fs.existsSync(masterKeyPath());
}
