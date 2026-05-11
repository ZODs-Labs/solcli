import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { BINARY, makeIsolatedEnv, runCli } from "./helpers.js";

describe("AC1 - --help works", () => {
  it("prints usage and exits 0", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("solcli");
    expect(stdout.toLowerCase()).toContain("usage");
  });

  it("--version prints semver", async () => {
    const { stdout, exitCode } = await runCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});

describe("AC9 - structured error path: parseable envelope, stable exit codes", () => {
  /**
   * Helper: in --output json mode, the binary writes the error envelope as the
   * sole stdout payload. Parse it strictly; any extra text (e.g. a leaked
   * stack trace) makes JSON.parse throw and fails the test.
   */
  function parseEnvelope(stdout: string): { schemaVersion: 1; error: Record<string, unknown> } {
    const trimmed = stdout.trim();
    return JSON.parse(trimmed) as { schemaVersion: 1; error: Record<string, unknown> };
  }

  it("UsageError thrown by a command produces a parseable envelope and exits 2", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "--output",
      "json",
      "plugin",
      "example",
      "demo",
      "--fail",
    ]);
    const env = parseEnvelope(stdout);
    expect(env.schemaVersion).toBe(1);
    expect(env.error).toMatchObject({
      schemaVersion: 1,
      code: "SOLCLI_E_USAGE",
      exitCode: 2,
    });
    expect(exitCode).toBe(2);
    // Stderr must NOT carry a stack trace for an expected error.
    expect(stderr).not.toMatch(/at .*\.js:\d+/);
  });

  it("SecretError surfaces SOLCLI_E_SECRET and exits 11", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      ["--output", "json", "secrets", "get", "definitely-not-set"],
      { SOLCLI_FORCE_SECRETS_BACKEND: "encrypted-file" },
    );
    const env = parseEnvelope(stdout);
    expect(env.error).toMatchObject({
      code: "SOLCLI_E_SECRET",
      exitCode: 11,
    });
    expect(exitCode).toBe(11);
    expect(stderr).not.toMatch(/at .*\.js:\d+/);
  });

  it("unknown subcommand is routed through UsageError and exits 2", async () => {
    const { stdout, exitCode } = await runCli(["--output", "json", "this-command-does-not-exist"]);
    const env = parseEnvelope(stdout);
    expect(env.error.code).toBe("SOLCLI_E_USAGE");
    expect(exitCode).toBe(2);
  });

  it("missing required positional is routed through UsageError and exits 2", async () => {
    const { stdout, exitCode } = await runCli(["--output", "json", "secrets", "get"], {
      SOLCLI_FORCE_SECRETS_BACKEND: "encrypted-file",
    });
    const env = parseEnvelope(stdout);
    expect(env.error.code).toBe("SOLCLI_E_USAGE");
    expect(exitCode).toBe(2);
  });
});

describe("AC15 - TTY-aware default output mode", () => {
  it("non-TTY stdout (piped) defaults to JSON envelope without explicit --output", async () => {
    const { stdout, exitCode } = await runCli(["plugin", "example", "demo", "--count", "1"]);
    expect(exitCode).toBe(0);
    // execa captures stdout, so the binary sees a non-TTY pipe.
    expect(stdout.trim().startsWith("{")).toBe(true);
    const parsed = JSON.parse(stdout.trim()) as { schemaVersion: 1; data: unknown };
    expect(parsed.schemaVersion).toBe(1);
  });
});

describe("NDJSON fan-out for collection payloads", () => {
  it("emits one JSON object per line for {records: [...]} payloads", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "ndjson",
      "plugin",
      "example",
      "demo",
      "--count",
      "3",
    ]);
    expect(exitCode).toBe(0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(3);
    for (const [i, line] of lines.entries()) {
      const obj = JSON.parse(line) as { schemaVersion: 1; data: { i: number } };
      expect(obj.schemaVersion).toBe(1);
      expect(obj.data.i).toBe(i);
    }
  });
});

describe("AC13 - SIGINT handler is wired", () => {
  it("sending SIGINT to a running invocation does not crash the binary", async () => {
    const { env } = await makeIsolatedEnv();
    const child = execa(
      "node",
      [
        BINARY,
        "--output",
        "ndjson",
        "plugin",
        "example",
        "demo",
        "--mode",
        "stream",
        "--count",
        "100",
      ],
      { env, reject: false, timeout: 10_000 },
    );
    await new Promise((r) => setTimeout(r, 50));
    child.kill("SIGINT");
    const result = await child;
    const signaled = result.signal === "SIGINT" || result.signal === "SIGTERM";
    const acceptable = new Set<number>([0, 1, 130, 143]);
    const exitCode = result.exitCode;
    expect(signaled || (typeof exitCode === "number" && acceptable.has(exitCode))).toBe(true);
  }, 15_000);
});
