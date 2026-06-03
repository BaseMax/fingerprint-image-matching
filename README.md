# fingerprint-image-matching

High-accuracy fingerprint **image** matching for payment-grade authentication,
in TypeScript on **Bun**, powered by the real [SourceAFIS](https://sourceafis.machinezoo.com/)
engine.

> **Why SourceAFIS?** There is no production-grade *pure-JavaScript* fingerprint
> minutiae matcher. SourceAFIS is the de-facto open-source AFIS and ships with
> published accuracy numbers. We run it through
> [`sourceafis-js`](https://www.npmjs.com/package/sourceafis-js), a thin wrapper
> that drives the SourceAFIS **Java** engine via `node-java`. The TypeScript
> layer here handles image I/O, the CLI, encryption, and 1:1 / 1:N matching.

---

## Requirements

- **Bun** (latest) — primary runtime for the CLI and tests.
- **Node.js 18+** on `PATH` — under Bun, `sourceafis-js` runs the JVM work in a
  short-lived Node subprocess. If `node` isn't on `PATH`, set `SOURCEAFIS_NODE_BIN`.
- **JDK 11+** — to start the JVM and to build the `node-java` native addon.
  `JAVA_HOME` is auto-detected from common install locations; set it explicitly
  if detection fails.
- A C/C++ toolchain for `node-java` (on Windows: Visual Studio Build Tools +
  Python; installed automatically by most VS setups).

## Setup

```sh
bun install          # installs sourceafis-js (+ builds node-java native addon)
bun run setup        # downloads the SourceAFIS jars into vendor/sourceafis
```

`bun run setup` fetches the SourceAFIS jar plus its runtime dependencies from
Maven Central. They are **not** committed to git (one of them, `fastutil`, is
~23 MB). The bundled classpath inside the npm package points at the package
author's machine, so we vendor our own copies and wire up the classpath in
[`src/sourceafis-env.ts`](src/sourceafis-env.ts).

## Usage

Compare two images directly (most useful for quick testing — no key needed):

```sh
bun run src/index.ts match tests/fingerprint1/1.bmp tests/fingerprint1/2.bmp
# or, after `bun link`:  fpmatch match a.bmp b.bmp --dpi 500 --threshold 40
```

Enroll + verify with an encrypted, on-disk template:

```sh
bun run src/index.ts keygen --out key.bin
bun run src/index.ts enroll tests/fingerprint1/1.bmp --key key.bin --out user1.tpl
bun run src/index.ts verify tests/fingerprint1/1.bmp --key key.bin --template user1.tpl
```

### As a library

```ts
import { FingerprintAuthSystem } from "./src/matcher";
import { generateKey } from "./src/crypto";

const system = new FingerprintAuthSystem(generateKey()); // use a KMS key in prod
const enrolled = await system.enroll("a.png", { dpi: 500 });      // 1: encrypt + store
const result = await system.verify("b.png", enrolled);            // 1:1 verification
console.log(result); // { score, matched, threshold }
```

Supported image formats are whatever the SourceAFIS Java engine decodes:
**PNG, JPEG, BMP**, and **WSQ** (via jnbis). No `sharp` / native image lib needed.

## Accuracy & thresholds

SourceAFIS scores are calibrated so that a **threshold of 40** targets roughly
**FMR 0.01%**. The default threshold here is `40`
([`DEFAULT_THRESHOLD`](src/matcher.ts)). Tune it against your own data once you
have multiple fingerprint groups (build an ROC curve from genuine vs. impostor
score distributions).

### ⚠️ About the bundled sample images

`tests/fingerprint1/1.bmp` and `2.bmp` are only **121×133 px** — a very small
fingerprint area, yielding tiny templates (~230–330 bytes, very few minutiae).
Measured scores:

| Comparison                | Score | Matched @40 |
| ------------------------- | ----- | ----------- |
| `1.bmp` vs `1.bmp` (self) | ~187  | ✅ yes      |
| `1.bmp` vs `2.bmp` (pair) | ~3.3  | ❌ no       |

So the two provided samples do **not** match as a genuine pair under SourceAFIS.
The engine and pipeline are correct (self-match is decisively high); the low
cross-score is a property of these specific low-resolution, small-area images.
For meaningful genuine-match testing, use larger, ~500 dpi captures of the same
finger with good ridge area.

## Performance

| Mode                        | JVM lifecycle          | Per-match latency         |
| --------------------------- | ---------------------- | ------------------------- |
| **Bun** (this CLI/tests)    | fresh JVM per call     | ~1.5–2 s (cold each time) |
| **Node** (long-running svc) | JVM stays warm in-proc | ~150–200 ms after warm-up |

Under Bun, every SourceAFIS call spawns a short-lived Node+JVM subprocess, so
each call pays JVM startup. That's fine for one-shot CLI use, but to hit the
`<500 ms`, 10-matches/sec target for a payment service, **run the matching
service under Node** (warm in-process JVM) — or front it with a persistent Node
worker. The TypeScript API in this repo is identical on both runtimes.

## Security notes

- Templates are stored encrypted with **AES-256-GCM** (authenticated) —
  [`src/crypto.ts`](src/crypto.ts). Tampering is detected on decrypt.
- The CLI uses an explicit key file; in production load the key from a **KMS/HSM**,
  never a per-process ephemeral key (a restart would invalidate all templates).
- Raw image bytes and templates are never logged.
- For payments, combine 1:1 verification with a second factor (token/PIN) and add
  **liveness/anti-spoofing** (out of scope here).

## Project layout

```
src/
  index.ts            CLI (match / keygen / enroll / verify)
  matcher.ts          FingerprintAuthSystem: enroll, verify (1:1), identify (1:N)
  engine.ts           typed adapter over sourceafis-js
  sourceafis-env.ts   locates JDK + wires the SourceAFIS classpath (side-effect import)
  crypto.ts           AES-256-GCM template encryption
  types.ts            shared interfaces
scripts/
  fetch-jars.ts       downloads SourceAFIS jars (`bun run setup`)
tests/
  matcher.test.ts     crypto + matching + enroll/verify/identify tests
  fingerprint1/       sample images (1.bmp, 2.bmp)
vendor/sourceafis/    downloaded jars (gitignored)
```

## Testing

```sh
bun test
```

The suite covers AES round-trip/tamper-rejection, template extraction,
self-match vs. cross-pair ordering, and enroll→verify / identify flows.
