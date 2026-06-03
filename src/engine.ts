/**
 * Thin, typed adapter over `sourceafis-js`.
 *
 * IMPORTANT: `./sourceafis-env` is imported first (for its side effects) so the
 * JVM classpath and JAVA_HOME are configured before `sourceafis-js` loads.
 *
 * Under Bun, `sourceafis-js` transparently runs the JVM work in a Node
 * subprocess and exchanges everything as `Buffer`s, which is exactly the shape
 * this adapter exposes.
 */
import "./sourceafis-env";
// eslint-disable-next-line import/no-named-as-default-member
import * as safis from "sourceafis-js";
import type { ImageOptions } from "./types";

const DEFAULT_DPI = 500;

/** A raw (unencrypted) SourceAFIS template as bytes. */
export type RawTemplate = Buffer;

function toSafisOptions(options?: ImageOptions): { dpi: number } {
  return { dpi: options?.dpi ?? DEFAULT_DPI };
}

/**
 * Extract a SourceAFIS template from an encoded image buffer.
 * Supported formats are whatever the SourceAFIS Java engine can decode
 * (PNG, JPEG, BMP, and WSQ via jnbis).
 */
export function extractTemplate(image: Buffer, options?: ImageOptions): RawTemplate {
  return safis.templateFromEncoded(image, toSafisOptions(options));
}

/**
 * Match two raw templates and return the SourceAFIS similarity score.
 * The score is symmetric-ish but, like upstream, we treat the first argument
 * as the probe.
 */
export function matchTemplates(probe: RawTemplate, candidate: RawTemplate): number {
  return safis.matchTemplates(probe, candidate);
}

/**
 * Build a reusable matcher around a probe template. Far faster than
 * {@link matchTemplates} when comparing one probe against many candidates
 * (1:N identification), because the probe is only prepared once.
 */
export function createMatcher(probe: RawTemplate): unknown {
  return safis.createMatcher(probe);
}

/** Score a candidate template against a matcher built by {@link createMatcher}. */
export function matchWithMatcher(matcher: unknown, candidate: RawTemplate): number {
  return safis.matchWithMatcher(matcher, candidate);
}
