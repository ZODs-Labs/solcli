import { describe, expect, it } from "vitest";
import configIndex from "../../../src/commands/config/index.js";

describe("config command group", () => {
  it("registers get/set/list subcommands", () => {
    const sub = (configIndex as { subCommands: Record<string, unknown> }).subCommands;
    expect(sub).toHaveProperty("get");
    expect(sub).toHaveProperty("set");
    expect(sub).toHaveProperty("list");
  });
});
