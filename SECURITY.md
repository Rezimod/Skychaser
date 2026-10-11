# Security — Dependency Advisory Triage

_Last triaged: 2026-06-19 (audit finding F-002). Network: devnet. Re-run before the Q3 mainnet migration._

`npm audit --omit=dev` currently reports **27 high** advisories. Every one was triaged below. **None is a direct, exploitable risk in Skychaser's runtime today**, and the headline figure is dominated by one transitive tree.

## ⚠️ Do NOT run `npm audit fix --force`

For almost every high advisory, npm's "fix available" resolves to **`@privy-io/react-auth@1.74.1`** — a **major _downgrade_** from the installed `3.19.0` (and `@privy-io/server-auth@1.15.3` from `1.32.5`). Applying it would revert the Privy SDK by a major version and break auth, embedded wallets, and the fiat onramp. The auto-fix is wrong for this project; remediate manually per the table below.

## Triage

| Advisory | Severity | Reaches us via | Fix status | Decision |
|---|---|---|---|---|
| `bigint-buffer` — buffer overflow in `toBigIntLE()` (GHSA-3gc7-fjrx-p6mg) | High | `@solana/spl-token` → `@solana/buffer-layout-utils` → `bigint-buffer@1.1.5` | **No fix published** | **Accept.** Parses on-chain SPL account data we control; not fed attacker-arbitrary buffers. Re-check when `@solana/spl-token` bumps. |
| `@solana/buffer-layout-utils`, `@solana/spl-token` | High | (same chain as above) | No non-breaking fix | **Accept** with `bigint-buffer`. |
| `ws` — uninitialized memory disclosure / DoS (GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p) | High | `viem` → `ws`, pulled in by Privy's EVM connector tree | Patched `ws` releases exist | **Pin via `overrides`** and re-audit (see below). |
| `viem`, `@coinbase/cdp-sdk`, `@base-org/account`, `@coinbase/wallet-sdk`, `@reown/appkit*`, `@walletconnect/ethereum-provider`, `@wagmi/connectors`, `@safe-global/*`, `x402`, `@privy-io/*` | High | All transitive under **`@privy-io/react-auth@3.x`** (its bundled EVM/WalletConnect connector set) | Only "fix" is a Privy **major downgrade** (breaking) | **Accept until Privy ships a patched 3.x.** Skychaser is Solana-only via Privy embedded wallets; this EVM connector code is in the dependency graph but not on Skychaser's runtime path. Track Privy releases and bump when a non-downgrade fix lands. |
| `@solana/pay` → `@solana/spl-token` | High | `@solana/pay@0.2.6` | Fix is `@solana/pay@1.0.20` (major) | **Evaluate** the `@solana/pay` v1 upgrade as scoped work (API changes); not a blind bump. |

## Suggested `overrides` to test (do NOT blind-apply)

Add to `package.json`, then run `npm install && npm audit --omit=dev` locally and smoke-test Privy login + a Solana Pay flow before committing:

```jsonc
{
  "overrides": {
    "ws": "^8.18.3"
  }
}
```

If `npm ls ws` shows a residual `ws@7.x` under a specific dependency after this, add a scoped override for that path. Only widen overrides if they verifiably reduce the high count **without** forcing a Privy/Solana SDK downgrade.

## Mainnet gate

Before the Q3 2026 mainnet migration:
1. Re-run `npm audit --omit=dev` and re-triage this table.
2. Confirm Privy has shipped a patched `3.x` (or accept the EVM-connector tree with sign-off).
3. Apply the `ws` override and re-verify the high count.
4. Re-evaluate the `@solana/pay` v1 upgrade.
