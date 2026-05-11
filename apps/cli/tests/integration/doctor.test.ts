import { describe, expect, it } from "vitest";
import { runCli } from "./helpers.js";

describe("doctor command", () => {
  it("--output json emits a structured health report", async () => {
    const { stdout, exitCode } = await runCli(["--output", "json", "doctor"]);
    expect([0, 1]).toContain(exitCode);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.data.checks).toBeInstanceOf(Array);
    const names = (parsed.data.checks as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain("node");
    expect(names).toContain("os");
    expect(names).toContain("paths");
    expect(names).toContain("config");
    expect(names).toContain("secrets");
    expect(names).toContain("providers");
    expect(names).toContain("output-formats");
  });
});
