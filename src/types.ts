/**
 * A serialized, encrypted SourceAFIS template ready for storage.
 * Layout: [ 12-byte IV | 16-byte GCM auth tag | ciphertext ].
 */
export type EncryptedTemplate = Buffer;

/** Options that influence how an image is turned into a template. */
export interface ImageOptions {
  /**
   * Scanner resolution in dots-per-inch. SourceAFIS is calibrated for 500 dpi;
   * supplying the correct value is important for accuracy. Defaults to 500.
   */
  dpi?: number;
}

/** Result of a 1:1 verification. */
export interface MatchResult {
  /** Raw SourceAFIS similarity score (higher = more similar). */
  score: number;
  /** Whether the score met or exceeded the threshold. */
  matched: boolean;
  /** Threshold the score was compared against. */
  threshold: number;
}

/** A candidate in a 1:N gallery for identification. */
export interface GalleryEntry {
  /** Stable identifier for the enrolled subject (e.g. userId). */
  id: string;
  /** Encrypted template blob produced by {@link EncryptedTemplate}. */
  template: EncryptedTemplate;
}

/** Result of a 1:N identification against a gallery. */
export interface IdentifyResult extends MatchResult {
  /** Id of the best-scoring gallery entry, or null if the gallery was empty. */
  id: string | null;
}
