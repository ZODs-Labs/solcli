import { describe, expect, it } from "vitest";
import example from "../../../src/commands/plugin/example.command.js";

describe("plugin/example command", () => {
  it("has meta, args (subject, count, mode, fail) and run", () => {
    const cmd = example as { meta: { name: string }; args: Record<string, unknown>; run: unknown };
    expect(cmd.meta.name).toBe("example");
    expect(cmd.args).toHaveProperty("subject");
    expect(cmd.args).toHaveProperty("count");
    expect(cmd.args).toHaveProperty("mode");
    expect(cmd.args).toHaveProperty("fail");
    expect(typeof cmd.run).toBe("function");
  });
});
