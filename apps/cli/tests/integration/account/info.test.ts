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

describe("account info command", () => {
  it("invalid pubkey fails with SOLCLI_E_INPUT_INVALID (exit 2)", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "account",
      "info",
      "NOT_A_PUBKEY",
    ]);
    expect(exitCode).toBe(2);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_INPUT_INVALID");
  });

  it("fails fast when no provider is registered", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "account",
      "info",
      VALID_PUBKEY,
    ]);
    expect([31, 69]).toContain(exitCode);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toMatch(/^SOLCLI_E_/);
  });

  it.skip("msw-node intercepts and emits an account.info envelope", () => {
    // TODO: wiring -- once GetAccountInfo port is added to the contracts
    // and a provider registers it, assert kind === "account.info",
    // data.address === VALID_PUBKEY and that owner / executable / dataLen
    // appear on the envelope.
  });
});
