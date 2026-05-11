# Solana Kit migration — implementation matrix

Concrete execution plan to eliminate every parallel implementation of something `@solana/kit` or `@solana-program/*` already ships. **No re-branding of existing types. No duplication.**

## Ground rules

1. Where Kit ships a type with matching semantics (`Address`, `Lamports`, `Blockhash`, `Signature`, `Slot`, `UnixTimestamp`, `MicroLamports`), we re-export it from `@solcli/contracts` and delete our brand. No parallel brand layer.
2. Where Kit ships a function with matching semantics (base58 encode/decode, transfer-sol, transfer-checked, find-associated-token-pda, sendAndConfirm), we delete our implementation and call Kit's.
3. Domain refinements that Kit does not ship (`MintAddress`, `OwnerAddress`, `TokenAccount`, `ProgramId`) collapse to `type X = Address` (no nominal distinction). The parameter name carries the meaning.
4. Every milestone (`M1`..`M10`) ends with `pnpm typecheck && pnpm lint && pnpm test` green and a commit.

## Type mapping (`@solcli/contracts` → `@solana/kit`)

| Custom brand | Kit type | Source module | Notes |
|---|---|---|---|
| `Pubkey` | `Address` | `@solana/addresses` | re-export; Pubkey becomes a deprecated alias if needed for one cycle, then deleted |
| `MintAddress` | `Address` | as above | drop nominal refinement |
| `OwnerAddress` | `Address` | as above | drop nominal refinement |
| `ProgramId` | `Address` | as above | drop nominal refinement |
| `TokenAccount` | `Address` | as above | drop nominal refinement |
| `Signature` | `Signature` | `@solana/keys` | re-export |
| `Blockhash` | `Blockhash` | `@solana/rpc-types` | re-export |
| `Slot` | `Slot` | `@solana/rpc-types` | Kit's `Slot` is plain `bigint`, not branded; lose the brand |
| `BlockHeight` | `Epoch` or `bigint` | `@solana/rpc-types` | use `bigint` directly; Kit has no `BlockHeight` brand |
| `UnixSeconds` | `UnixTimestamp` | `@solana/rpc-types` | re-export |
| `Lamports` | `Lamports` | `@solana/rpc-types` | re-export |
| `Sol` | keep | — | Kit ships `Sol`, but our usage is sparse; we'll re-export Kit's `Sol` too |
| `TokenAmount` | keep (our brand) | — | Kit has no per-mint amount brand; we keep `Brand<bigint, 'TokenAmount'>` |
| `MicroLamports` | `MicroLamports` | `@solana/rpc-types` | re-export; replaces hand-rolled `priorityFeeMicroLamportsPerCu: bigint` |

## Shape mapping

| Custom shape | Kit equivalent | Notes |
|---|---|---|
| `InstructionAccountMeta { pubkey, isSigner, isWritable }` | `AccountMeta { address, role: AccountRole }` | `@solana/instructions` |
| `InstructionPlan { programId, keys, data }` | `Instruction { programAddress, accounts?, data? }` | direct replacement |
| `TransactionPlan { version, payer, recentBlockhash, instructions, ... }` | `TransactionMessage` (compiled via `compileTransaction`) | direct replacement |
| `SignedTransaction { version, payer, serializedMessage, signatures[] }` | Kit's `Transaction { messageBytes, signatures }` | re-export Kit's shape |

## Implementation matrix

| ID | Title | Action | Files written | Files deleted | Depends on |
|----|-------|--------|---------------|---------------|------------|
| **M1** | Brand alignment | Re-export Kit types from `@solcli/contracts/domain`; collapse Pubkey/MintAddress/etc. to `Address`; drop the standalone brand layer | `domain/{pubkey,signature,amount}.ts`, `domain/index.ts`, all importers across packages + apps | `domain/brand.ts` (when no remaining brand uses it) | none |
| **M2** | TransactionPlan/Instruction shape collapse | `tx-plan.ts` becomes thin re-exports of `Instruction` and `TransactionMessage`. Signer + protocol builders consume Kit types directly. | `tx-plan.ts`, signer/serialize.ts, protocol builders, ports/{sign,execute}-transaction | obsolete shape duplicates | M1 |
| **M3** | Native transfer | Replace `buildTransferPlan` body with `getTransferSolInstruction({ source, destination, amount })` and return an `Instruction[]` ready for inclusion in a TransactionMessage | `protocol-native/src/transfer.ts` | `protocol-native/src/base58.ts`, `protocol-native/src/constants.ts` | M1, M2 |
| **M4** | Native stake | `getDelegateStakeInstruction` etc. from `@solana-program/stake` | `protocol-native/src/stake.ts` | — | M1, M2 |
| **M5** | Native vote | No upstream package; rewrite using Kit codecs + `Address` | `protocol-native/src/vote.ts` | — | M1, M2 |
| **M6** | SPL transfer | `getTransferCheckedInstruction` from `@solana-program/token` | `protocol-spl-token/src/transfer.ts` | — | M1, M2 |
| **M7** | ATA derivation | `findAssociatedTokenPda` from `@solana-program/token` | `protocol-spl-token/src/ata.ts` | `protocol-spl-token/src/base58.ts`, `protocol-spl-token/src/constants.ts` | M1 |
| **M8** | Helius RPC adapter | Build `createSolanaRpc(heliusUrl)` and a `createSolanaRpcSubscriptions(wssUrl)`. Wire port adapters to RPC methods. | `providers/vendors/helius/index.ts` | — | M1 |
| **M9** | Confirm via Kit | Replace `tx/stages/confirm.ts` polling with `sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })` | `tx/src/stages/confirm.ts`, possibly `tx/src/stages/send.ts` | — | M8 |
| **M10** | base58 cleanup | Remove `signer/src/base58.ts` re-export and route callers through `@solana/kit` directly | callers | `signer/src/base58.ts` | M3, M6, M7 |

## Out of scope for this pass

- Heavy "Port + Operation + fallback-chain" abstraction. It exists; trimming it where Kit's RPC client subsumes it is a separate cleanup. Don't conflate.
- `@solcli/safety` redundancy with `simulateTransaction`. Separate cleanup.
- Brand alignment for `TokenAmount` (per-mint scale; Kit has no equivalent — we keep it).
- Wallet-Standard / Ledger signers — not in this codebase yet.

## Risk register

| Risk | Mitigation |
|---|---|
| Test fixtures use base58 strings that aren't on-curve; `address()` will validate at runtime | Replace with on-curve fixtures or cast at the boundary only inside test helpers |
| Removing `Pubkey` brand may break callers that pass `string` where the old brand admitted it | TypeScript will flag every site; runtime validation happens once at parse boundary |
| `compileTransaction` requires non-empty instructions and a fee payer; some tests may construct invalid plans | Update test fixtures to be valid v0 messages |
| Helius adapter must accept TLS verification, retries, abort signal — same as the current hand-rolled stubs | Wrap Kit RPC client with the existing retry/abort policy at adapter level |

## Done = green gates per milestone

After every milestone, in order:

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:architecture
pnpm verify:deps
pnpm build
```

Then commit.
