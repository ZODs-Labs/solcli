# @solcli/protocol-native

Native Solana protocol builders for solcli. Produces `TransactionPlan`
instances for SystemProgram and StakeProgram instructions and a small
reader for vote account identity fields.

This package depends only on `@solcli/contracts` and `@solcli/solana-stubs`;
it does not import heavy Solana SDKs, so it is safe on the cold start path.

## Surface

- `buildTransferPlan` (SystemProgram::Transfer)
- `buildDelegatePlan` (StakeProgram::DelegateStake)
- `buildWithdrawPlan` (StakeProgram::Withdraw)
- `readVoteInfo` (vote account identity fields)
- `NATIVE_PROTOCOL_BINDINGS` (registry shape for downstream wiring)

## Status

v0. Layouts are hand rolled with `Uint8Array` and `DataView`; the vote
account reader uses a naive slice of the first 97 bytes. Both will be
replaced once the v1 RPC flow ships a shared layout module in
`@solcli/solana-stubs`.
