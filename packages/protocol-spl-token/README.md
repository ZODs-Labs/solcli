# @solcli/protocol-spl-token

Reference protocol bindings for the SPL Token program.

## Scope

This package owns the pure (no SDK, no RPC) layer for SPL Token v0:

- `getTokenBalance(args, deps)`: read a single (owner, mint) balance through a `GetTokenBalancesPort`.
- `buildTokenTransferPlan(args)`: assemble a `TransactionPlan` for `transferChecked` (instruction tag 12) targeting the classic SPL Token program.
- `deriveAtaAddress(owner, mint, tokenProgramId)`: compute the Associated Token Account address using the canonical PDA seed layout.

Token-2022 writes are deferred. The `TOKEN_2022_PROGRAM_ID` constant is exported for future read paths.

## Program constants

| Constant | Address |
| --- | --- |
| `SPL_TOKEN_PROGRAM_ID` | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| `TOKEN_2022_PROGRAM_ID` | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |
| `ATA_PROGRAM_ID` | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |

## transferChecked wire format

The 10 byte instruction data layout encoded by `buildTokenTransferPlan`:

```
[0]      u8 tag       = 0x0c (12)
[1..9]   u64 LE       amount (raw, mint-specific decimals)
[9]      u8 decimals
```

Key order (mandated by the program):

1. `source`        (writable)
2. `mint`          (read-only)
3. `destination`   (writable)
4. `owner`         (signer, read-only)

## ATA derivation

`deriveAtaAddress` hashes the canonical seed bundle and returns the first off-curve candidate found while iterating `nonce` from 255 down to 0. The hash input matches the on-chain layout:

```
sha256(owner_bytes || tokenProgramId_bytes || mint_bytes || [nonce]
       || ATA_PROGRAM_ID_bytes || "ProgramDerivedAddress")
```

### Known limitation

The on-curve check used by the canonical algorithm requires an ed25519 point-validation helper. That helper has not yet landed in `@solcli/solana-stubs` and pulling in `@noble/curves` was deferred to keep this task scoped to `packages/protocol-spl-token/**`. The current implementation uses a placeholder `isOnCurve` that returns `false` for every candidate, so the returned address is the `nonce = 255` hash. The output remains:

- deterministic for fixed inputs
- 32 bytes wide
- valid base58

Once the on-curve helper ships, swap the placeholder for the canonical check and lock in test vectors against known mainnet ATAs. Until then, do not rely on this derivation to match the canonical ATA on chain.

## Ports

`SPL_TOKEN_PROTOCOL_BINDINGS` exposes the three operations under a stable shape:

```ts
{
  name: "@solcli/protocol-spl-token",
  ports: { getTokenBalance, buildTokenTransferPlan, deriveAtaAddress },
  commands: ["token balance", "token transfer"],
}
```

The app composition layer wires these bindings into the command runtime. Commands never import this package directly per `AGENTS.md`.
