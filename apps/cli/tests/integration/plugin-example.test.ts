import { describe, expect, it } from "vitest";
import { runCli } from "./helpers.js";

describe("plugin/example reference command", () => {
  it("human output (default)", async () => {
    const { stdout, exitCode } = await runCli(["plugin", "example", "demo", "--count", "2"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("demo");
  });

  it("json output is a single document", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "plugin",
      "example",
      "demo",
      "--count",
      "3",
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.data.subject).toBe("demo");
    expect(parsed.data.records).toHaveLength(3);
  });

  it("ndjson streaming yields one object per line", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "ndjson",
      "plugin",
      "example",
      "demo",
      "--count",
      "4",
      "--mode",
      "stream",
    ]);
    expect(exitCode).toBe(0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      const env = JSON.parse(line) as { schemaVersion: 1; data: { subject: string; i: number } };
      expect(env.schemaVersion).toBe(1);
      expect(env.data.subject).toBe("demo");
    }
  });

  it("--fail exercises the error path", async () => {
    const { exitCode, stdout, stderr } = await runCli([
      "--output",
      "json",
      "plugin",
      "example",
      "demo",
      "--fail",
    ]);
    expect(exitCode).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toContain("SOLCLI_E_USAGE");
  });
});
