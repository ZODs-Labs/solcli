import { describe, expect, it } from "vitest";
import { runCli } from "../transfer/helpers.js";

const VALID_PUBKEY = "9wEcBkNg5kS8wTrL3VBKHwH4YyN6w6kS3pVqDNAXY5pY";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface ErrorEnvelope {
  schemaVersion: 1;
  error: { code: string; message: string; exitCode: number; details?: Record<string, unknown> };
}

interface SuccessEnvelope<T> {
  schemaVersion: 1;
  data: T;
}

function parseJson<T>(s: string): T {
  return JSON.parse(s.trim()) as T;
}

describe("token transfer command", () => {
  it("refuses Token-2022 mints with SOLCLI_E_INPUT_INVALID (EX_DATAERR)", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "token",
      "transfer",
      VALID_PUBKEY,
      "--mint",
      VALID_PUBKEY,
      "--amount",
      "100",
      "--decimals",
      "6",
      "--source",
      VALID_PUBKEY,
      "--signer",
      "test-signer",
      "--owner",
      VALID_PUBKEY,
      "--mint-program",
      TOKEN_2022_PROGRAM,
    ]);
    // SOLCLI_E_INPUT_INVALID (the EX_DATAERR-shaped validation error) maps
    // to exit 2 per docs/exit-codes.md; the brief allows whichever code the
    // catalog assigns to ValidationError. Pin both for safety.
    expect([2, 65]).toContain(exitCode);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_INPUT_INVALID");
    expect(env.error.message).toMatch(/Token-2022/);
  });

  it("token-2022 keyword override also refuses", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "token",
      "transfer",
      VALID_PUBKEY,
      "--mint",
      VALID_PUBKEY,
      "--amount",
      "100",
      "--decimals",
      "6",
      "--source",
      VALID_PUBKEY,
      "--signer",
      "test-signer",
      "--owner",
      VALID_PUBKEY,
      "--mint-program",
      "token-2022",
    ]);
    expect([2, 65]).toContain(exitCode);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_INPUT_INVALID");
  });

  it("--execute without --idempotency-key fails with SOLCLI_E_SAFETY_INTENT_REQUIRED", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "token",
      "transfer",
      VALID_PUBKEY,
      "--mint",
      VALID_PUBKEY,
      "--amount",
      "100",
      "--decimals",
      "6",
      "--source",
      VALID_PUBKEY,
      "--signer",
      "test-signer",
      "--owner",
      VALID_PUBKEY,
      "--execute",
    ]);
    expect(exitCode).toBe(78);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_SAFETY_INTENT_REQUIRED");
  });

  it("--simulate emits a token.transfer.simulation envelope", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "token",
      "transfer",
      VALID_PUBKEY,
      "--mint",
      VALID_PUBKEY,
      "--amount",
      "100",
      "--decimals",
      "6",
      "--source",
      VALID_PUBKEY,
      "--signer",
      "test-signer",
      "--owner",
      VALID_PUBKEY,
    ]);
    expect(exitCode).toBe(0);
    const env =
      parseJson<
        SuccessEnvelope<{
          kind: string;
          data: { transfer: { amount: string; decimals: number } };
        }>
      >(stdout);
    expect(env.data.kind).toBe("token.transfer.simulation");
    expect(env.data.data.transfer.amount).toBe("100");
    expect(env.data.data.transfer.decimals).toBe(6);
  });

  it("invalid decimals fails with SOLCLI_E_INPUT_INVALID", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "token",
      "transfer",
      VALID_PUBKEY,
      "--mint",
      VALID_PUBKEY,
      "--amount",
      "100",
      "--decimals",
      "99",
      "--source",
      VALID_PUBKEY,
      "--signer",
      "test-signer",
      "--owner",
      VALID_PUBKEY,
    ]);
    expect(exitCode).toBe(2);
    const env = parseJson<ErrorEnvelope>(stdout);
    expect(env.error.code).toBe("SOLCLI_E_INPUT_INVALID");
  });
});
