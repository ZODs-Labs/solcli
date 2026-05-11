import { describe, expect, it } from "vitest";
import { buildPaths } from "../src/index.js";

describe("buildPaths", () => {
  it("returns all five categories for solcli", () => {
    const p = buildPaths("solcli");
    expect(p.data).toBeTruthy();
    expect(p.config).toBeTruthy();
    expect(p.cache).toBeTruthy();
    expect(p.log).toBeTruthy();
    expect(p.temp).toBeTruthy();
  });

  it("contains the app name (no -nodejs suffix)", () => {
    const p = buildPaths("solcli");
    expect(p.data).toContain("solcli");
    expect(p.data).not.toContain("-nodejs");
  });

  it("respects a custom app name", () => {
    const p = buildPaths("custom-app");
    expect(p.data).toContain("custom-app");
  });
});
