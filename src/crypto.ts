/**
 * AES-256-GCM encryption for fingerprint templates at rest.
 *
 * Templates are biometric data: even though a SourceAFIS template cannot be
 * trivially reversed into an image, it is still personal data and must be
 * protected. We use authenticated encryption (GCM) so tampering is detected.
 *
 * Uses Node's `crypto` (fully supported by Bun) rather than any made-up API.
 *
 * Blob layout: [ 12-byte IV | 16-byte auth tag | ciphertext ].
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import type { EncryptedTemplate } from "./types";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256-bit key
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Generate a fresh random 256-bit key.
 *
 * In production this key MUST come from a KMS/HSM, not be generated per process;
 * a key that lives only in memory means every restart invalidates all templates.
 */
export function generateKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes, got ${key.length}.`);
  }
}

/** Encrypt template bytes, returning a self-contained blob. */
export function encryptTemplate(plaintext: Buffer, key: Buffer): EncryptedTemplate {
  assertKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/** Decrypt a blob produced by {@link encryptTemplate}. Throws on tampering. */
export function decryptTemplate(blob: EncryptedTemplate, key: Buffer): Buffer {
  assertKey(key);
  if (blob.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted template is too short to be valid.");
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Constant-time equality for two buffers of equal length.
 * Useful for comparing opaque tokens without leaking timing information.
 */
export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
