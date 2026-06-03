/**
 * Downloads the SourceAFIS jar and its runtime dependencies from Maven Central
 * into `vendor/sourceafis`. These are required by `sourceafis-js` at runtime.
 *
 * Run with: `bun run setup`
 *
 * The jars are deliberately not committed to git (see .gitignore) because one of
 * them (fastutil) is ~23 MB. This script makes the install reproducible.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAVEN = "https://repo1.maven.org/maven2";

// group/artifact/version — pinned to match the SourceAFIS 3.18.1 release.
const ARTIFACTS = [
  "com/machinezoo/sourceafis/sourceafis/3.18.1/sourceafis-3.18.1.jar",
  "com/machinezoo/stagean/stagean/1.3.0/stagean-1.3.0.jar",
  "com/machinezoo/closeablescope/closeablescope/1.0.1/closeablescope-1.0.1.jar",
  "com/machinezoo/noexception/noexception/1.9.1/noexception-1.9.1.jar",
  "org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.jar",
  "com/machinezoo/fingerprintio/fingerprintio/1.3.1/fingerprintio-1.3.1.jar",
  "it/unimi/dsi/fastutil/8.5.12/fastutil-8.5.12.jar",
  "commons-io/commons-io/2.15.0/commons-io-2.15.0.jar",
  "com/google/code/gson/gson/2.10.1/gson-2.10.1.jar",
  "com/fasterxml/jackson/core/jackson-databind/2.15.3/jackson-databind-2.15.3.jar",
  "com/fasterxml/jackson/core/jackson-annotations/2.15.3/jackson-annotations-2.15.3.jar",
  "com/fasterxml/jackson/core/jackson-core/2.15.3/jackson-core-2.15.3.jar",
  "com/fasterxml/jackson/dataformat/jackson-dataformat-cbor/2.15.3/jackson-dataformat-cbor-2.15.3.jar",
  "com/github/mhshams/jnbis/2.1.2/jnbis-2.1.2.jar",
];

const vendorDir = join(dirname(fileURLToPath(import.meta.url)), "..", "vendor", "sourceafis");

async function download(pathInRepo: string): Promise<void> {
  const fileName = pathInRepo.split("/").pop()!;
  const dest = join(vendorDir, fileName);
  if (existsSync(dest)) {
    console.log(`✓ ${fileName} (cached)`);
    return;
  }
  const url = `${MAVEN}/${pathInRepo}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, bytes);
  console.log(`✓ ${fileName} (${(bytes.length / 1024).toFixed(0)} KB)`);
}

async function main(): Promise<void> {
  await mkdir(vendorDir, { recursive: true });
  console.log(`Fetching ${ARTIFACTS.length} jars into ${vendorDir} ...`);
  for (const artifact of ARTIFACTS) {
    await download(artifact);
  }
  console.log("Done. SourceAFIS runtime is ready.");
}

main().catch((err) => {
  console.error(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
