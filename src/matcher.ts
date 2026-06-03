/**
 * Fingerprint enrollment, 1:1 verification and 1:N identification.
 *
 * Templates are extracted with SourceAFIS and stored encrypted. The matching
 * decision is a simple threshold on the SourceAFIS score.
 */
import { readFile } from "node:fs/promises";
import {
  createMatcher,
  extractTemplate,
  matchTemplates,
  matchWithMatcher,
  type RawTemplate,
} from "./engine";
import { decryptTemplate, encryptTemplate, generateKey } from "./crypto";
import type {
  EncryptedTemplate,
  GalleryEntry,
  IdentifyResult,
  ImageOptions,
  MatchResult,
} from "./types";

/**
 * Default match threshold on the SourceAFIS score scale. Per SourceAFIS
 * documentation, a threshold of 40 targets a false match rate around 0.01%.
 * Tune this against your own data once you have multiple groups.
 */
export const DEFAULT_THRESHOLD = 40;

export class FingerprintAuthSystem {
  private readonly key: Buffer;

  /**
   * @param key 32-byte AES key. If omitted, an ephemeral key is generated,
   *   which means templates can only be matched within this process lifetime.
   *   In production, load a stable key from a KMS/HSM.
   */
  constructor(key?: Buffer) {
    this.key = key ?? generateKey();
  }

  /** Extract + encrypt a template from raw image bytes. */
  enrollBuffer(image: Buffer, options?: ImageOptions): EncryptedTemplate {
    const template = extractTemplate(image, options);
    return encryptTemplate(template, this.key);
  }

  /** Extract + encrypt a template from an image file on disk. */
  async enroll(imagePath: string, options?: ImageOptions): Promise<EncryptedTemplate> {
    const image = await readFile(imagePath);
    return this.enrollBuffer(image, options);
  }

  private decrypt(blob: EncryptedTemplate): RawTemplate {
    return decryptTemplate(blob, this.key);
  }

  /** Verify a probe image (bytes) against one enrolled template. */
  verifyBuffer(
    probeImage: Buffer,
    enrolled: EncryptedTemplate,
    threshold: number = DEFAULT_THRESHOLD,
    options?: ImageOptions,
  ): MatchResult {
    const probe = extractTemplate(probeImage, options);
    const candidate = this.decrypt(enrolled);
    const score = matchTemplates(probe, candidate);
    return { score, matched: score >= threshold, threshold };
  }

  /** Verify a probe image file against one enrolled template. */
  async verify(
    probeImagePath: string,
    enrolled: EncryptedTemplate,
    threshold: number = DEFAULT_THRESHOLD,
    options?: ImageOptions,
  ): Promise<MatchResult> {
    const probeImage = await readFile(probeImagePath);
    return this.verifyBuffer(probeImage, enrolled, threshold, options);
  }

  /**
   * Identify a probe image against a gallery (1:N). Returns the best match.
   * Builds the probe matcher once and reuses it across all candidates.
   */
  identifyBuffer(
    probeImage: Buffer,
    gallery: GalleryEntry[],
    threshold: number = DEFAULT_THRESHOLD,
    options?: ImageOptions,
  ): IdentifyResult {
    const probe = extractTemplate(probeImage, options);
    const matcher = createMatcher(probe);

    let bestId: string | null = null;
    let bestScore = -Infinity;
    for (const entry of gallery) {
      const candidate = this.decrypt(entry.template);
      const score = matchWithMatcher(matcher, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestId = entry.id;
      }
    }

    const score = bestScore === -Infinity ? 0 : bestScore;
    return { id: bestId, score, matched: bestId !== null && score >= threshold, threshold };
  }

  /** Identify a probe image file against a gallery (1:N). */
  async identify(
    probeImagePath: string,
    gallery: GalleryEntry[],
    threshold: number = DEFAULT_THRESHOLD,
    options?: ImageOptions,
  ): Promise<IdentifyResult> {
    const probeImage = await readFile(probeImagePath);
    return this.identifyBuffer(probeImage, gallery, threshold, options);
  }
}
