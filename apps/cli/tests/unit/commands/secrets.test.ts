import { describe, expect, it } from "vitest";
import secretsIndex from "../../../src/commands/secrets/index.js";

describe("secrets command group", () => {
  it("registers set/get/list/rm subcommands", () => {
    const sub = (secretsIndex as { subCommands: Record<string, unknown> }).subCommands;
    expect(sub).toHaveProperty("set");
    expect(sub).toHaveProperty("get");
    expect(sub).toHaveProperty("list");
    expect(sub).toHaveProperty("rm");
  });
});
