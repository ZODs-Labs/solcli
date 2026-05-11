import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KeyringBackend } from "../src/index.js";

describe("KeyringBackend probe", () => {
  it("returns a boolean without throwing", () => {
    const result = KeyringBackend.probe();
    expect(typeof result).toBe("boolean");
  });
});

describe("KeyringBackend round-trip (best-effort, skipped if keyring absent)", () => {
  const keyringAvailable = KeyringBackend.probe();
  const maybe = keyringAvailable && !process.env["CI"] ? it : it.skip;

  maybe("set/get/list/delete round-trip on the live OS keyring", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solcli-kr-"));
    const b = new KeyringBackend({
      data: dir,
      config: dir,
      cache: dir,
      log: dir,
      temp: dir,
    });
    const name = `__test_${process.pid}_${Date.now()}`;
    try {
      await b.set(name, "v");
      expect(await b.get(name)).toBe("v");
      const names = await b.list();
      expect(names).toContain(name);
    } finally {
      await b.delete(name);
    }
  });
});
