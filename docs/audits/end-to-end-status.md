# End-to-end status — honest review

After the Kit migration (M1..M10, commits `379cba7` → `f7b7507`), what does solcli actually do end-to-end?

## TL;DR

- **Read commands work.** Provided a Helius API key is configured (or any standards-compliant Solana RPC endpoint), every read command resolves through Kit's `createSolanaRpc(url)` and returns real on-chain data.
- **Simulate paths work.** `solcli transfer --simulate` and `solcli token transfer --simulate` build a real v0 transaction message via `@solana-program/system` / `@solana-program/token`, base64-encode it, and submit to the RPC's `simulateTransaction` with `replaceRecentBlockhash: true`. The simulate response comes back through the standard simulate port.
- **Execute paths do not work yet.** `--execute` reaches `ctx.ops.txExecute` which calls `resolvePort(ctx.providers, "executeTransaction")` — no provider registers that port. Also `ctx.tx` and `ctx.signers` are still placeholder getters that throw "v1-deferred". The signer crypto itself is correct (Phase A); what's missing is the wiring that turns the signer registry into a port and injects it into the tx service.
- **Static / local commands all work** (config, secrets, doctor, help, manifest, IDL caching, plugin host, MCP).

## Per-command status

| Command | Status | Path | Gap |
|---|---|---|---|
| `solcli balance <owner>` | ✅ works | `ctx.ops.getBalance` → Helius `rpc.getBalance` | none |
| `solcli account info <addr>` | ⚠️ partial | uses `getBalance` as a proxy | shows only lamports; needs a `getAccountInfo` port |
| `solcli token balance <owner>` | ✅ works | `resolvePort("getTokenBalances")` → Helius `rpc.getTokenAccountsByOwner` | none; metadata field is empty (no Metaplex decode yet) |
| `solcli transfer <to> --simulate` | ✅ works | `buildTransferMessage` (`@solana-program/system`) → `resolvePort("simulateTransaction")` → Helius `rpc.simulateTransaction` with `replaceRecentBlockhash: true` | none for the simulate-only path |
| `solcli transfer <to> --execute` | ❌ unwired | `txExecute` → `resolvePort("executeTransaction")` (no provider declares it) | needs `ctx.tx` wired + `ctx.signers` wired |
| `solcli token transfer ... --simulate` | ✅ works | `buildTokenTransferMessage` (`@solana-program/token`) → simulate port | same as native transfer |
| `solcli token transfer ... --execute` | ❌ unwired | same path as transfer | same gap |
| `solcli config get/set/list` | ✅ works | `@solcli/config` directly | none |
| `solcli secrets get/set/rm/list` | ✅ works | `@solcli/secrets` directly (keyring or encrypted-file backend) | none |
| `solcli doctor` | ✅ works | local checks; reports config + secrets backend + provider status | accurate today; should grow as new subsystems land |
| `solcli help <topic>` | ✅ works | static command bodies | none |
| `solcli manifest` | ✅ works | reads `dist/generated/manifest.json` | shipped manifest still uses pre-M1 port labels; rebuild produces correct manifest |
| `solcli mcp serve` / `mcp tools` | ✅ works | MCP bridge over stdio | none for the bridge; the tools list it serves is the read-side ports |
| `solcli idl add/list/remove/call` | ✅ works (call simulates only) | IDL cache + `idl-synth` → `simulateTransaction` for `call` | `call --execute` has the same gap as `transfer --execute` |
| `solcli plugins install/list/remove/verify` | ✅ works | extension host | none |

## What's wired

### Providers (Helius, Triton)

Both adapters take `{ apiKey?, endpoint?, network?, rpc? }`, call `createSolanaRpc(url)`, and register the standard port set:

- `getBalance`
- `getTokenBalances`
- `simulateTransaction`
- `getTransaction`
- `getTransactionHistory`

The shared factory lives at [packages/providers/src/_base/rpc-ports.ts](packages/providers/src/_base/rpc-ports.ts). No per-vendor duplication of the wire mapping. Tests can inject a fake `StandardRpcClient` so the adapters run without a network.

### Confirm (for whenever execute lands)

[packages/providers/src/_base/rpc-confirm.ts](packages/providers/src/_base/rpc-confirm.ts) ships `createConfirmSignatureFn({ rpc, rpcSubscriptions, commitment })` which delegates to `@solana/transaction-confirmation`'s `createRecentSignatureConfirmationPromiseFactory`. Single websocket notification wakes the caller; no polling. Ready to be wired into `ctx.tx`.

### Signer

`@solcli/signer` produces real v0 wire bytes via `compileTransaction` (M2) and signs them via `@solana/keys` `signBytes` over the result (Phase A). The `file`, `env` and `keychain` adapters all use the shared `signWithKeyBytes` pipeline. The signer's cryptographic correctness is verified by `packages/signer/tests/adapters/file.test.ts:135` which uses `node:crypto.verify` to assert the produced signature validates against the fixture pubkey and `serializedMessage`.

### Protocol builders

- `buildTransferMessage` → `@solana-program/system` `getTransferSolInstruction`
- `buildTokenTransferMessage` → `@solana-program/token` `getTransferCheckedInstruction`
- `buildDelegateMessage` / `buildWithdrawMessage` → `@solana-program/stake`
- `deriveAtaAddress` → `@solana-program/token` `findAssociatedTokenPda` (the placeholder on-curve check is gone)

Each returns a fully-formed `SignableTransactionMessage` (Kit's `TransactionMessage & TransactionMessageWithFeePayer & TransactionMessageWithBlockhashLifetime`).

## What's not wired yet

### 1. `ctx.tx` and `ctx.signers` are placeholder getters that throw

Where: [apps/cli/src/context.ts:222](apps/cli/src/context.ts), [apps/cli/src/context.ts:233](apps/cli/src/context.ts).

These two getters intentionally throw `InternalError("v1-deferred")`. Every code path that would have called `ctx.tx.execute(...)` or `ctx.signers.get(alias)` instead currently routes through `resolvePort(ctx.providers, "executeTransaction")` — which is never registered.

To wire `ctx.tx`:

1. Capture the active provider's `rpc` and `rpcSubscriptions` at registration time. The vendor factories already build a `StandardRpcClient` internally; either:
   - Return them as fields on the `ProviderInstance` (typed extension), or
   - Have `registerConfiguredProviders` keep a local reference to the kit handles.
2. Build a `TransactionServiceDeps` bundle:
   - `simulate` = `resolvePort(providers, "simulateTransaction").port`
   - `fee` = `resolvePort(providers, "getPriorityFeePolicy").port` — **not implemented anywhere yet**
   - `sign` = signer registry → SignTransactionPort
   - `sendRawTransaction` = wrap `rpc.sendTransaction`
   - `confirmSignature` = `createConfirmSignatureFn({ rpc, rpcSubscriptions })`
   - `refreshBlockhash` = wrap `rpc.getLatestBlockhash`
   - `cache`, `clock`, `logger`, `events` = trivial
3. Pass into `createTransactionService(deps)`.

To wire `ctx.signers`:

1. A production `SecretsCrypto` (AES-256-GCM + argon2id) needs to live in `@solcli/secrets` (today it only exists in the signer test fixtures at [packages/signer/tests/helpers/test-crypto.ts](packages/signer/tests/helpers/test-crypto.ts)). Move it to `@solcli/secrets/crypto.ts`.
2. Wrap `@solcli/secrets` `KeyringBackend` into a `KeychainBackend` (the contracts are similar but not identical).
3. Build `SignerAdapterFactory` that creates `file` / `env` / `keychain` adapters by kind.
4. Pass to `createSignerRegistry`.

Total work to land both: ~150-250 lines of glue, no new abstractions needed.

### 2. `executeTransaction`, `getPriorityFeePolicy`, `submitBundle` ports

No provider declares these. `tx-execute.ts` references them. Two cleanups apply:

- **`executeTransaction`** should not be a provider port at all. It's a SERVICE-level concern (compose simulate + safety + sign + send + confirm). When `ctx.tx` is wired, [apps/cli/src/operations/tx-execute.ts](apps/cli/src/operations/tx-execute.ts) should call `ctx.tx.execute(...)` directly, not `resolvePort(...,"executeTransaction")`.
- **`getPriorityFeePolicy`** is Helius-proprietary. It should be a vendor-only port on the Helius adapter (the Triton adapter does not implement it). The current Helius manifest does not declare it; M8 didn't add it because Kit's RPC API doesn't have a typed method for the Helius extension. Adding it is ~30 lines using `createDefaultRpcTransport` to send the raw JSON-RPC method.
- **`submitBundle`** is Jito-specific. We have no Jito adapter today. A future vendor module.

### 3. `account info` returns only lamports

[apps/cli/src/commands/account/info.command.ts:40](apps/cli/src/commands/account/info.command.ts) calls `ctx.ops.getBalance` and a TODO admits the proper fix: route through a `getAccountInfo` port (owner, executable, dataLen, rentEpoch). Adding it is ~50 lines: a port in `@solcli/contracts/ports`, a binding in `createStandardRpcPorts` wrapping `rpc.getAccountInfo`, and an op + a command swap.

### 4. Token-2022 path on token transfer

The token transfer command refuses Token-2022 via an explicit `--mint-program` override. The correct behavior is to discover the mint's owner via `getAccountInfo` and dispatch to the right token program automatically. Same gap as item 3 — needs the `getAccountInfo` port.

### 5. Provider-level RPC retry / abort hardening

The `_base/rpc-ports.ts` adapters wrap RPC calls with `callRpc(name, fn)` which normalizes errors into `RpcError`. They do NOT yet:

- Rate-limit (Helius is rate-limited per-second on the free tier).
- Retry with exponential backoff on transient failures.
- Surface `Retry-After` headers from 429 responses.

The contracts already define `RpcRateLimitError` and `RpcTimeoutError`. The wrapper should classify Kit's transport errors and emit the right typed error. ~50 lines, doable in one pass.

### 6. Structural over-engineering still in place

Independent of the Kit migration, two pieces of the architecture remain heavier than they need to be:

- **The Port + Operation + fallback-chain layer.** For ops that map 1:1 to a single Kit RPC method (`getBalance`, `getTokenBalances`, `getTransaction`), the fallback chain rarely earns its keep — `createSolanaRpc(url)` already accepts a custom `fetch` you can wrap for retry, throttling and multi-endpoint failover. Trimming this would consolidate `apps/cli/src/operations/*.ts` into about half the lines and remove the parallel `resolvePort`/`resolvePortCandidates` codepath.
- **`@solcli/safety` redundancy.** Most of what it does (simulate-first gate, cost-budget check, allowed-programs check) is what `simulateTransaction` returns plus ~30 lines of post-processing. The package is 32 tests for what could be one file in `packages/tx/src/stages/safety-gate.ts`. Not blocking; worth a future cleanup.

Neither of these is a Kit-migration concern; they're separate cleanup passes.

## What you can actually run today

Assuming you've got a Helius API key and a basic `solcli.toml`:

```toml
[provider]
active = "helius"

[provider.helius]
apiKeySecret = "helius-api-key"
```

And stashed the secret:

```
solcli secrets set helius-api-key <your-key>
```

These should work end-to-end against mainnet-beta:

```
solcli balance 9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde
solcli token balance 9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde
solcli token balance 9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
solcli transfer <to> --amount-sol 0.001 --signer primary --from <from> --simulate
solcli token transfer <to> --mint <mint> --amount 1000 --decimals 6 --source <source> --signer primary --simulate
solcli account info <addr>     # shows lamports only
solcli config list
solcli secrets list
solcli doctor
solcli help <topic>
solcli manifest
solcli mcp tools
```

These will fail explicitly (clear error) until the wiring described above lands:

```
solcli transfer ... --execute        # SOLCLI_E_PROVIDER_UNSUPPORTED for executeTransaction
solcli token transfer ... --execute  # same
solcli idl call ... --execute        # same
```

## Recommended next steps (in priority order)

1. **Wire `ctx.tx` end-to-end** so `--execute` paths work. ~150 lines in `apps/cli/src/context.ts` + a `wireKitTxDeps(provider, signers, ...)` helper.
2. **Move `SecretsCrypto` from test fixtures into `@solcli/secrets`** and wire `ctx.signers` via `createSignerRegistry`. ~80 lines.
3. **Add the `getAccountInfo` port** so `account info` returns the full account and `token transfer` can route Token-2022 correctly. ~50 lines.
4. **Add the RPC retry/throttle wrapper** to the Helius adapter's HTTP transport. ~50 lines.
5. **Add the Helius proprietary `getPriorityFeeEstimate`** so the fee policy can resolve. ~30 lines.
6. (Optional) Trim the Port + Operation + fallback-chain layer for 1:1 RPC ops.
7. (Optional) Inline `@solcli/safety` into `packages/tx/src/stages/`.

Items 1-5 land the user-facing functionality. Items 6-7 are architectural simplifications that are easier to do once items 1-5 are in place.
