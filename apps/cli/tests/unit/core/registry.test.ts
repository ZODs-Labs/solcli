import { describe, expect, it } from "vitest";
import { rootCommand } from "../../../src/registry.js";

describe("rootCommand", () => {
  it("has solcli meta name", () => {
    const meta = (rootCommand as { meta: { name: string } }).meta;
    expect(meta.name).toBe("solcli");
  });

  it("declares the global flags", () => {
    const args = (rootCommand as { args: Record<string, unknown> }).args;
    expect(args).toHaveProperty("output");
    expect(args).toHaveProperty("network");
    expect(args).toHaveProperty("profile");
    expect(args).toHaveProperty("verbose");
    expect(args).toHaveProperty("quiet");
    expect(args).toHaveProperty("no-color");
    expect(args).toHaveProperty("no-input");
    expect(args).toHaveProperty("no-cache");
    expect(args).toHaveProperty("yes");
  });
});
