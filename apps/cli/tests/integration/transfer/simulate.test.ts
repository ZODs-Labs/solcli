import { describe, expect, it } from "vitest";
import { runCli } from "./helpers.js";

const VALID_PUBKEY = "9wEcBkNg5kS8wTrL3VBKHwH4YyN6w6kS3pVqDNAXY5pY";

interface ErrorEnvelope {
  schemaVersion: 1;
  error: {
    schemaVersion: 1;
    code: string;
    message: string;
    exitCode: number;
    details?: Record<string, unknown>;
  };
}

interface SuccessEnvelope<T> {
  schemaVersion: 1;
  data: T;
}

function parseJson<T>(s: string): T {
  return JSON.parse(s.trim()) as T;
}

describe("transfer simulate path", () => {
  it("--simulate (default) writes a transfer.simulation envelope", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "transfer",
      "transfer",
      VALID_PUBKEY,
      "--amount-sol",
      "0.1",
      "--signer",
      "test-signer",
      "--from",
      VALID_PUBKEY,
    ]);
    expect(exitCode).toBe(0);
    const env =
      parseJson<
        SuccessEnvelope<{
          kind: string;
          data: {
            plan: { instructions: number; payer: string };
            transfer: { from: string; to: string; lamports: string };
          };
          meta: { network: string };
        }>
      >(stdout);
    expect(env.schemaVersion).toBe(1);
    expect(env.data.kind).toBe("transfer.simulation");
    expect(env.data.data.plan.instructions).toBe(1);
    expect(env.data.data.plan.payer).toBe(VALID_PUBKEY);
    expect(env.data.data.transfer.lamports).toBe("100000000");
    expect(env.data.meta.network).toBe("devnet");
  });

  it("--execute without --idempotency-key fails with SOLCLI_E_SAFETY_INTENT_REQUIRED", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "transfer",
      "transfer",
      VALID_PUBKEY,
      "--amount-sol",
      "0.1",
      "--signer",
      "test-signer",
      "--from",
      VALID_PUBKEY,
      "--execute",
    ]);
    expect(exitCode).toBe(78);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_SAFETY_INTENT_REQUIRED");
    expect(env.error.message).toMatch(/idempotency-key/);
  });

  it("--execute without --max-cost-lamports fails with SOLCLI_E_SAFETY_INTENT_REQUIRED", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "transfer",
      "transfer",
      VALID_PUBKEY,
      "--amount-sol",
      "0.1",
      "--signer",
      "test-signer",
      "--from",
      VALID_PUBKEY,
      "--execute",
      "--idempotency-key",
      "test-key-001",
    ]);
    expect(exitCode).toBe(78);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_SAFETY_INTENT_REQUIRED");
    expect(env.error.message).toMatch(/max-cost-lamports/);
  });

  it("invalid recipient pubkey fails with SOLCLI_E_INPUT_INVALID (exit 2)", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "transfer",
      "transfer",
      "NOT_A_PUBKEY",
      "--amount-sol",
      "0.1",
      "--signer",
      "test-signer",
    ]);
    expect(exitCode).toBe(2);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_INPUT_INVALID");
  });

  it("invalid --amount-sol fails with SOLCLI_E_INPUT_INVALID", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "transfer",
      "transfer",
      VALID_PUBKEY,
      "--amount-sol",
      "not-a-number",
      "--signer",
      "test-signer",
      "--from",
      VALID_PUBKEY,
    ]);
    expect(exitCode).toBe(2);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_INPUT_INVALID");
  });
});
