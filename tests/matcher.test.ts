import { beforeAll, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { FingerprintAuthSystem, DEFAULT_THRESHOLD } from "../src/matcher";
import { extractTemplate, matchTemplates } from "../src/engine";
import { constantTimeEqual, decryptTemplate, encryptTemplate, generateKey } from "../src/crypto";

const here = dirname(fileURLToPath(import.meta.url));
const IMG_1 = join(here, "fingerprint1", "1.bmp");
const IMG_2 = join(here, "fingerprint1", "2.bmp");
const DPI = 500;

// Each SourceAFIS call under Bun spins up a JVM subprocess, so give tests room.
const SLOW = 30_000;

describe("crypto", () => {
  it("round-trips a template through AES-256-GCM", () => {
    const key = generateKey();
    const plaintext = Buffer.from("a fake template payload");
    const blob = encryptTemplate(plaintext, key);
    expect(blob.equals(plaintext)).toBe(false); // actually encrypted
    const decrypted = decryptTemplate(blob, key);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("rejects a tampered ciphertext", () => {
    const key = generateKey();
    const blob = encryptTemplate(Buffer.from("payload"), key);
    const last = blob.length - 1;
    blob[last] = (blob[last] ?? 0) ^ 0xff; // flip a bit in the ciphertext
    expect(() => decryptTemplate(blob, key)).toThrow();
  });

  it("rejects a wrong key", () => {
    const blob = encryptTemplate(Buffer.from("payload"), generateKey());
    expect(() => decryptTemplate(blob, generateKey())).toThrow();
  });

  it("constant-time compares buffers", () => {
    expect(constantTimeEqual(Buffer.from("abc"), Buffer.from("abc"))).toBe(true);
    expect(constantTimeEqual(Buffer.from("abc"), Buffer.from("abd"))).toBe(false);
    expect(constantTimeEqual(Buffer.from("abc"), Buffer.from("ab"))).toBe(false);
  });
});

describe("SourceAFIS matching", () => {
  let img1: Buffer;
  let img2: Buffer;
  let tpl1: Buffer;
  let tpl2: Buffer;

  beforeAll(async () => {
    [img1, img2] = await Promise.all([readFile(IMG_1), readFile(IMG_2)]);
    tpl1 = extractTemplate(img1, { dpi: DPI });
    tpl2 = extractTemplate(img2, { dpi: DPI });
  }, SLOW);

  it("extracts non-empty templates", () => {
    expect(tpl1.length).toBeGreaterThan(0);
    expect(tpl2.length).toBeGreaterThan(0);
  });

  it(
    "scores a self-match well above threshold",
    () => {
      const score = matchTemplates(tpl1, tpl1);
      expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    },
    SLOW,
  );

  it(
    "scores a self-match higher than the cross-pair",
    () => {
      const self = matchTemplates(tpl1, tpl1);
      const cross = matchTemplates(tpl1, tpl2);
      expect(Number.isFinite(cross)).toBe(true);
      expect(self).toBeGreaterThan(cross);
    },
    SLOW,
  );
});

describe("FingerprintAuthSystem", () => {
  it(
    "enrolls and verifies the same image (self-consistency)",
    async () => {
      const system = new FingerprintAuthSystem(generateKey());
      const enrolled = await system.enroll(IMG_1, { dpi: DPI });
      const result = await system.verify(IMG_1, enrolled, DEFAULT_THRESHOLD, { dpi: DPI });
      expect(result.matched).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    },
    SLOW,
  );

  it(
    "identifies a probe against a small gallery",
    async () => {
      const system = new FingerprintAuthSystem(generateKey());
      const gallery = [
        { id: "user-1", template: await system.enroll(IMG_1, { dpi: DPI }) },
        { id: "user-2", template: await system.enroll(IMG_2, { dpi: DPI }) },
      ];
      const result = await system.identifyBuffer(
        await readFile(IMG_1),
        gallery,
        DEFAULT_THRESHOLD,
        { dpi: DPI },
      );
      // The probe is image 1, so the best gallery match must be user-1.
      expect(result.id).toBe("user-1");
      expect(result.matched).toBe(true);
    },
    SLOW,
  );
});
