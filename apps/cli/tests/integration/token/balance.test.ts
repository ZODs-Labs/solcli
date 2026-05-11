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

describe("token balance command", () => {
  it("invalid pubkey fails with SOLCLI_E_INPUT_INVALID (exit 2)", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "token",
      "balance",
      "NOT_A_PUBKEY",
    ]);
    expect(exitCode).toBe(2);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_INPUT_INVALID");
  });

  it("fails fast when no getTokenBalances provider is registered", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "token",
      "balance",
      VALID_PUBKEY,
    ]);
    expect([31, 69]).toContain(exitCode);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toMatch(/^SOLCLI_E_/);
  });

  it.skip("msw-node intercepts getTokenBalances and emits a token.balance envelope", () => {
    // TODO: wiring -- once a provider supporting getTokenBalances is wired,
    // assert kind === "token.balance", data.records is an array of
    // { mint, account, amount, decimals, uiAmount } records.
  });
});
