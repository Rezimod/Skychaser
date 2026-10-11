# Security — Dependency Advisory Triage

_Last triaged: 2026-10-11, before real mainnet payments (mainnet-readiness audit). Previous: 2026-06-19 (F-002)._

`npm audit --omit=dev` reports **5 high, 29 moderate, 0 critical**. Every high is triaged below; **none is a
direct, exploitable risk in Skychaser's runtime**.

## ⚠️ Do NOT run `npm audit fix --force`

Its "fixes" are major-version changes or downgrades of the Solana and Privy SDKs (e.g. `@solana/spl-token`
0.1.8, `@solana/pay` 1.x). Remediate by hand, per the table.

## Triage

| Advisory | Severity | Reaches us via | Decision |
|---|---|---|---|
| `bigint-buffer` — buffer overflow in `toBigIntLE()` (GHSA-3gc7-fjrx-p6mg) | High | `@solana/spl-token` → `@solana/buffer-layout-utils` → `bigint-buffer@1.1.5` | **Accept.** No fix published. Only parses SPL account data from the RPC, never attacker-supplied buffers. Re-check when `@solana/spl-token` bumps. |
| `@solana/buffer-layout-utils`, `@solana/spl-token` | High | Same chain | **Accept** with `bigint-buffer`. |
| `@solana/pay` ≤ 0.2.6 | High | Direct; the advisory is the `spl-token` chain above | **Accept.** Skychaser uses only `encodeURL` to build the payment link; payments are verified by its own code (`findPayment`, from balances), not `@solana/pay`'s validators. The 1.x upgrade is optional scoped work. |
| `source-map-js` | High | Build tooling | **Accept.** Build time only, not shipped to the runtime. |

## Fixed 2026-10-11

- `ws` 8.x < 8.21.0 (GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p): `"overrides": { "ws@^8": "^8.21.0" }` in
  `package.json`. Only the 8.x line is pinned; the one `ws@7.5.11` consumer is outside the advisories' range.
- `sharp` < 0.35.5 (librsvg, GHSA-wq5f-xc86-pv6w): bumped to `^0.35.5`. Its only runtime use renders the
  app's own WebP card art for OG images, never SVG or user input.

After pulling these changes, run `npm install` so local `node_modules` matches the lockfile.

## Next re-triage

Before each dependency bump of Privy or the Solana SDKs, and at least monthly while taking payments.
