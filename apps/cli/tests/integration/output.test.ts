import { describe, expect, it } from "vitest";
import { runCli } from "./helpers.js";

describe("output formats (AC5, AC6)", () => {
  it("AC5 - JSON output is jq-parseable", async () => {
    const { stdout, exitCode } = await runCli([
      "--output",
      "json",
      "plugin",
      "example",
      "x",
      "--count",
      "1",
    ]);
    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout.trim())).not.toThrow();
  });

  it("AC6 - non-TTY context drops ANSI color from human output", async () => {
    const { stdout, exitCode } = await runCli(["plugin", "example", "x", "--count", "1"]);
    expect(exitCode).toBe(0);
    const ESC = String.fromCharCode(0x1b);
    expect(stdout.includes(`${ESC}[`)).toBe(false);
  });

  it("ndjson output uses LF only", async () => {
    const { stdout } = await runCli([
      "--output",
      "ndjson",
      "plugin",
      "example",
      "x",
      "--count",
      "3",
      "--mode",
      "stream",
    ]);
    expect(stdout.includes("\r")).toBe(false);
  });
});
