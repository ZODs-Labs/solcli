import { describe, expect, it } from "vitest";
import { runCli } from "../transfer/helpers.js";

const VALID_PUBKEY = "9wEcBkNg5kS8wTrL3VBKHwH4YyN6w6kS3pVqDNAXY5pY";

interface ErrorEnvelope {
  schemaVersion: 1;
  error: { code: string; message: string; exitCode: number };
}

function parseJson<T>(s: string): T {
  return JSON.parse(s.trim()) as T;
}

describe("balance native command", () => {
  it("invalid pubkey fails with SOLCLI_E_INPUT_INVALID (exit 2)", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "balance",
      "balance",
      "NOT_A_PUBKEY",
    ]);
    expect(exitCode).toBe(2);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_INPUT_INVALID");
  });

  it("fails fast when no getBalance provider is registered", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "balance",
      "balance",
      VALID_PUBKEY,
    ]);
    // Without a configured provider the capability lookup fails before any
    // RPC is attempted. Once the wiring lands, the test below expecting
    // a balance.native envelope replaces this assertion.
    expect([31, 69]).toContain(exitCode);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toMatch(/^SOLCLI_E_/);
  });

  it.skip("msw-node intercepts getBalance and emits a balance.native envelope", () => {
    // TODO: wiring -- once a provider is registered in the isolated env
    // (helius adapter with msw-node intercepting the JSON-RPC endpoint),
    // assert: exitCode === 0, kind === "balance.native",
    // data.lamports === "1000000000", data.sol === "1".
  });
});
