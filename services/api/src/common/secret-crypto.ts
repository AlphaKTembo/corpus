import * as crypto from 'crypto';
import { ValueTransformer } from 'typeorm';

/**
 * Helpers for secrets stored in the database.
 *
 * - Third-party credentials we must read back (e.g. intervals.icu API keys) are
 *   encrypted with AES-256-GCM using CORPUS_ENCRYPTION_KEY (32 bytes, base64).
 * - Corpus API keys only need to be compared, so they are stored as SHA-256
 *   hashes and the plaintext is shown to the user once, at generation.
 *
 * Losing CORPUS_ENCRYPTION_KEY makes encrypted values unreadable; users would
 * have to reconnect intervals.icu. Back it up together with the database.
 */

const ENC_PREFIX = 'enc:v1:';
const HASH_PREFIX = 'sha256:';

let warnedMissingKey = false;

function encryptionKey(): Buffer | null {
  const raw = process.env.CORPUS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      // eslint-disable-next-line no-console
      console.warn('CORPUS_ENCRYPTION_KEY is not set; secrets are stored unencrypted.');
    }
    return null;
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CORPUS_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  }
  return key;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const key = encryptionKey();
  if (!key) {
    throw new Error('CORPUS_ENCRYPTION_KEY is required to read encrypted secrets.');
  }
  const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** TypeORM transformer: encrypt on write, decrypt on read. */
export const encryptedColumn: ValueTransformer = {
  to: (value?: string | null) =>
    value === undefined || value === null || value === '' || isEncrypted(value)
      ? value
      : encryptSecret(value),
  from: (value?: string | null) => {
    if (value === undefined || value === null || value === '') return value;
    try {
      return decryptSecret(value);
    } catch (err) {
      // Don't take down every query that loads a user: treat the secret as
      // missing (e.g. "intervals.icu not connected") and log loudly.
      // eslint-disable-next-line no-console
      console.error(`Failed to decrypt stored secret: ${(err as Error).message}`);
      return null;
    }
  },
};

export function hashApiKey(raw: string): string {
  return HASH_PREFIX + crypto.createHash('sha256').update(raw.trim(), 'utf8').digest('hex');
}

export function isHashedApiKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

/** Last 4 characters, for showing "key ending in …abcd". */
export function apiKeyHint(raw: string): string {
  return raw.trim().slice(-4);
}
