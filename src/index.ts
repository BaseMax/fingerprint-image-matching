#!/usr/bin/env bun
/**
 * CLI for the fingerprint matcher.
 *
 * Commands:
 *   match  <imageA> <imageB>              Compare two images directly (no key).
 *   keygen                                Generate an AES-256 key file.
 *   enroll <image> --key <file>           Enroll an image into an encrypted template.
 *   verify <probe> --template <file> --key <file>   Verify a probe against a template.
 *
 * Common options: --dpi <n> (default 500), --threshold <n> (default 40),
 *                 --out <file>.
 */
import { readFile, writeFile } from "node:fs/promises";
import { DEFAULT_THRESHOLD, FingerprintAuthSystem } from "./matcher";
import { extractTemplate, matchTemplates } from "./engine";
import { generateKey } from "./crypto";

interface Args {
  positionals: string[];
  flags: Map<string, string>;
  bools: Set<string>;
}

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        i++;
      } else {
        bools.add(name);
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags, bools };
}

function num(args: Args, name: string, fallback: number): number {
  const raw = args.flags.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got "${raw}".`);
  return value;
}

function requireFlag(args: Args, name: string): string {
  const value = args.flags.get(name);
  if (value === undefined) throw new Error(`Missing required option --${name}.`);
  return value;
}

const USAGE = `fpmatch — fingerprint image matching (SourceAFIS)

Usage:
  fpmatch match  <imageA> <imageB> [--dpi 500] [--threshold 40]
  fpmatch keygen [--out key.bin]
  fpmatch enroll <image> --key <file> [--out template.bin] [--dpi 500]
  fpmatch verify <probe> --template <file> --key <file> [--threshold 40] [--dpi 500]
`;

async function cmdMatch(args: Args): Promise<number> {
  const [a, b] = args.positionals;
  if (!a || !b) throw new Error("match requires two image paths.");
  const dpi = num(args, "dpi", 500);
  const threshold = num(args, "threshold", DEFAULT_THRESHOLD);

  const [imgA, imgB] = await Promise.all([readFile(a), readFile(b)]);
  const ta = extractTemplate(imgA, { dpi });
  const tb = extractTemplate(imgB, { dpi });
  const score = matchTemplates(ta, tb);
  const matched = score >= threshold;

  console.log(`Score:     ${score.toFixed(2)} (threshold ${threshold})`);
  console.log(`Match:     ${matched ? "YES" : "NO"}`);
  return matched ? 0 : 1;
}

async function cmdKeygen(args: Args): Promise<number> {
  const out = args.flags.get("out") ?? "key.bin";
  await writeFile(out, generateKey());
  console.log(`Wrote 256-bit key to ${out}. Keep it secret; losing it invalidates all templates.`);
  return 0;
}

async function cmdEnroll(args: Args): Promise<number> {
  const [image] = args.positionals;
  if (!image) throw new Error("enroll requires an image path.");
  const out = args.flags.get("out") ?? "template.bin";
  const dpi = num(args, "dpi", 500);
  const key = await readFile(requireFlag(args, "key"));

  const system = new FingerprintAuthSystem(key);
  const blob = await system.enroll(image, { dpi });
  await writeFile(out, blob);
  console.log(`Enrolled. Encrypted template written to ${out} (${blob.length} bytes).`);
  return 0;
}

async function cmdVerify(args: Args): Promise<number> {
  const [probe] = args.positionals;
  if (!probe) throw new Error("verify requires a probe image path.");
  const dpi = num(args, "dpi", 500);
  const threshold = num(args, "threshold", DEFAULT_THRESHOLD);
  const [key, template] = await Promise.all([
    readFile(requireFlag(args, "key")),
    readFile(requireFlag(args, "template")),
  ]);

  const system = new FingerprintAuthSystem(key);
  const result = await system.verify(probe, template, threshold, { dpi });
  console.log(`Score:     ${result.score.toFixed(2)} (threshold ${result.threshold})`);
  console.log(`Match:     ${result.matched ? "YES" : "NO"}`);
  return result.matched ? 0 : 1;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;
  const args = parseArgs(rest);

  switch (command) {
    case "match":
      return cmdMatch(args);
    case "keygen":
      return cmdKeygen(args);
    case "enroll":
      return cmdEnroll(args);
    case "verify":
      return cmdVerify(args);
    case undefined:
    case "help":
    case "--help":
      console.log(USAGE);
      return command === undefined ? 1 : 0;
    default:
      console.error(`Unknown command "${command}".\n`);
      console.log(USAGE);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  });
