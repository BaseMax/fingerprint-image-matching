/**
 * Configures the environment that `sourceafis-js` needs BEFORE it is imported.
 *
 * `sourceafis-js` drives the real SourceAFIS Java engine through `node-java`.
 * It needs two things at runtime:
 *   1. A JDK/JRE so the JVM can be started (located via JAVA_HOME).
 *   2. The SourceAFIS jar plus its dependency jars on the classpath.
 *
 * The dependency jars are vendored under `vendor/sourceafis` (run `bun run setup`
 * to download them). The classpath bundled inside the npm package points at the
 * package author's machine, so we override it here.
 *
 * Import this module for its side effects *before* importing `sourceafis-js`.
 */
import { existsSync, readdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const vendorDir = join(projectRoot, "vendor", "sourceafis");

/** Relative path from a JDK/JRE home to its JVM shared library, per platform. */
function jvmLibCandidates(home: string): string[] {
  if (process.platform === "win32") {
    return [join(home, "bin", "server", "jvm.dll"), join(home, "jre", "bin", "server", "jvm.dll")];
  }
  if (process.platform === "darwin") {
    return [
      join(home, "lib", "server", "libjvm.dylib"),
      join(home, "Contents", "Home", "lib", "server", "libjvm.dylib"),
    ];
  }
  return [join(home, "lib", "server", "libjvm.so")];
}

function hasJvm(home: string): boolean {
  return jvmLibCandidates(home).some(existsSync);
}

/** Common locations where JDKs are installed, per platform. */
function jdkSearchRoots(): string[] {
  if (process.platform === "win32") {
    return [
      "C:/Program Files/Java",
      "C:/Program Files/Eclipse Adoptium",
      "C:/Program Files/Microsoft",
      "C:/Program Files/Amazon Corretto",
      "C:/Program Files/Zulu",
    ];
  }
  if (process.platform === "darwin") {
    return ["/Library/Java/JavaVirtualMachines"];
  }
  return ["/usr/lib/jvm", "/usr/java"];
}

/** Resolve a usable JDK/JRE home, preferring an existing JAVA_HOME. */
function resolveJavaHome(): string {
  const fromEnv = process.env.JAVA_HOME;
  if (fromEnv && existsSync(fromEnv)) {
    // On macOS a bare home sometimes needs the Contents/Home suffix.
    if (hasJvm(fromEnv)) return fromEnv;
    const macHome = join(fromEnv, "Contents", "Home");
    if (hasJvm(macHome)) return macHome;
    return fromEnv;
  }

  const found: string[] = [];
  for (const root of jdkSearchRoots()) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const home = join(root, name);
      const macHome = join(home, "Contents", "Home");
      if (hasJvm(home)) found.push(home);
      else if (hasJvm(macHome)) found.push(macHome);
    }
  }
  if (found.length === 0) {
    throw new Error(
      "Could not locate a JDK/JRE. Install Java 11+ and set JAVA_HOME, e.g. " +
        '`$env:JAVA_HOME = "C:\\Program Files\\Java\\jdk-24"`.',
    );
  }
  // Prefer the highest version-looking name (e.g. jdk-24 over jdk-11).
  found.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return found[0]!;
}

/** Build the classpath string from the vendored jars. */
function resolveClasspath(): { classpath: string; mainJar: string } {
  if (!existsSync(vendorDir)) {
    throw new Error(
      `SourceAFIS jars not found at ${vendorDir}. Run \`bun run setup\` to download them.`,
    );
  }
  const jars = readdirSync(vendorDir)
    .filter((f) => f.endsWith(".jar"))
    .map((f) => join(vendorDir, f));
  const mainJar = jars.find((j) => j.includes("sourceafis-"));
  if (!mainJar) {
    throw new Error(`No sourceafis-*.jar found in ${vendorDir}. Run \`bun run setup\`.`);
  }
  return { classpath: jars.join(delimiter), mainJar };
}

let configured = false;

/**
 * Idempotently configure JAVA_HOME, SOURCEAFIS_CLASSPATH and SOURCEAFIS_JAR.
 * Safe to call multiple times; only the first call does work.
 */
export function configureSourceAfisEnv(): void {
  if (configured) return;

  const javaHome = resolveJavaHome();
  process.env.JAVA_HOME = javaHome;

  const { classpath, mainJar } = resolveClasspath();
  // Prepend our jars so they win over the (broken) bundled classpath.txt.
  process.env.SOURCEAFIS_CLASSPATH = process.env.SOURCEAFIS_CLASSPATH
    ? `${classpath}${delimiter}${process.env.SOURCEAFIS_CLASSPATH}`
    : classpath;
  process.env.SOURCEAFIS_JAR = mainJar;

  configured = true;
}

// Configure on import so a simple `import "./sourceafis-env"` is enough.
configureSourceAfisEnv();
