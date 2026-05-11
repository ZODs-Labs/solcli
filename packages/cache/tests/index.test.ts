import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TwoTierCache } from "../src/index.js";

async function makeCache(opts: { enabled?: boolean; ttl?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "solcli-cache-"));
  return {
    dir,
    cache: new TwoTierCache({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
      ...(opts.ttl !== undefined ? { ttlSecondsDefault: opts.ttl } : {}),
    }),
  };
}

const key = { namespace: "test", call: "getX", params: "1" };

describe("TwoTierCache", () => {
  it("set then get round-trips through memory", async () => {
    const { cache: c } = await makeCache();
    await c.set(key, { foo: "bar" }, 60);
    expect(await c.get(key)).toEqual({ foo: "bar" });
  });

  it("get returns undefined for missing key", async () => {
    const { cache: c } = await makeCache();
    expect(await c.get(key)).toBeUndefined();
  });

  it("delete removes the entry", async () => {
    const { cache: c } = await makeCache();
    await c.set(key, "v");
    await c.delete(key);
    expect(await c.get(key)).toBeUndefined();
  });

  it("expired disk entry is purged on read", async () => {
    const { dir, cache: c } = await makeCache();
    await c.set(key, "v", 1);
    await new Promise((r) => setTimeout(r, 1200));
    const c2 = new TwoTierCache({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
    });
    expect(await c2.get(key)).toBeUndefined();
  });

  it("disabled mode is a no-op", async () => {
    const { cache: c } = await makeCache({ enabled: false });
    await c.set(key, "v");
    expect(await c.get(key)).toBeUndefined();
  });

  it("persists to disk and survives a fresh in-memory layer", async () => {
    const { dir, cache: c } = await makeCache();
    await c.set(key, "value-persisted", 600);
    const c2 = new TwoTierCache({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
    });
    expect(await c2.get(key)).toBe("value-persisted");
  });
});
