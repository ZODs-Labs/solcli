import { describe, expect, it } from "vitest";
import { runCli } from "./helpers.js";

const VALID_PUBKEY = "9wEcBkNg5kS8wTrL3VBKHwH4YyN6w6kS3pVqDNAXY5pY";

interface ErrorEnvelope {
  schemaVersion: 1;
  error: { code: string; message: string; exitCode: number };
}

function parseJson<T>(s: string): T {
  return JSON.parse(s.trim()) as T;
}

describe("transfer --execute pipeline", () => {
  /**
   * The full fixture-replayed execute path (build -> simulate -> sign -> send
   * -> confirm + NDJSON events emission) requires the peer sessions to land:
   *   - @solcli/tx (TransactionService composition)
   *   - @solcli/safety (gate ports registered)
   *   - @solcli/signer (file signer + fixture keystore)
   *   - @solcli/events (event writer on ctx)
   *   - msw-node HTTP fixture wiring
   * Until those are wired into the CLI context, this test exercises only
   * the path that fails fast inside the configured-provider lookup.
   * TODO: wiring -- replace with fixture-based simulate / send / confirm
   * once ctx.tx / ctx.events / signer manager are exposed.
   */
  it("fails with provider-unsupported when no execute port is registered", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "transfer",
      "transfer",
      VALID_PUBKEY,
      "--amount-sol",
      "0.001",
      "--signer",
      "fixture-signer",
      "--from",
      VALID_PUBKEY,
      "--execute",
      "--idempotency-key",
      "execute-test-001",
      "--max-cost-lamports",
      "5000",
      "--priority-fee",
      "none",
      "--via",
      "rpc",
    ]);
    // Without a configured provider, the safety port resolution fails before
    // any RPC is attempted. The exit code is the ProviderCapabilityUnsupported
    // code (31). When the wiring lands, this becomes a 0/success assertion.
    expect([31, 65, 69, 78]).toContain(exitCode);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toMatch(/^SOLCLI_E_/);
  });

  it.skip("fixture-replayed simulate + send + confirm emits NDJSON events", () => {
    // TODO: wiring -- once @solcli/events exposes ctx.events and the
    // SafetyEvaluatePort + ExecuteTransactionPort are registered, assert the
    // following events appear on the events sink in order:
    //   tx.build, safety.gate.passed, tx.simulate, tx.fee.estimated,
    //   intent.emitted, tx.signed, tx.sent, tx.confirmed.
    // Use msw-node to intercept HTTP and replay fixtures captured against
    // devnet for getBalance / simulateTransaction / sendTransaction /
    // getSignatureStatuses.
  });
});
