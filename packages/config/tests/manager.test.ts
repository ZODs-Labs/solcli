import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createConfigManager } from "../src/index.js";

async function makeMgr() {
  const dir = await mkdtemp(join(tmpdir(), "solcli-mgr-"));
  return {
    dir,
    mgr: await createConfigManager({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      env: {},
    }),
  };
}

describe("FileConfigManager", () => {
  it("returns defaults on a fresh install", async () => {
    const { mgr } = await makeMgr();
    const cfg = mgr.read();
    expect(cfg.network).toBe("mainnet-beta");
    expect(cfg.provider.active).toBe("rpc-only");
  });

  it("set then get round-trips", async () => {
    const { mgr } = await makeMgr();
    await mgr.set("network", "devnet");
    expect(mgr.get("network")).toBe("devnet");
  });

  it("set persists across new manager instance", async () => {
    const { dir, mgr } = await makeMgr();
    await mgr.set("network", "devnet");
    const mgr2 = await createConfigManager({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      env: {},
    });
    expect(mgr2.read().network).toBe("devnet");
  });

  it("supports nested keys via dotted path", async () => {
    const { mgr } = await makeMgr();
    await mgr.set("rpc.primary", "https://example.com");
    expect(mgr.read().rpc.primary).toBe("https://example.com");
  });

  it("switchProfile changes active profile and persists default_profile", async () => {
    const { dir, mgr } = await makeMgr();
    await mgr.switchProfile("devnet-test");
    expect(mgr.activeProfile()).toBe("devnet-test");
    const mgr2 = await createConfigManager({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      env: {},
    });
    expect(mgr2.activeProfile()).toBe("devnet-test");
  });

  it("env overrides win over file", async () => {
    const { dir, mgr } = await makeMgr();
    await mgr.set("network", "devnet");
    const mgr2 = await createConfigManager({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      env: { SOLCLI_NETWORK: "testnet" },
    });
    expect(mgr2.read().network).toBe("testnet");
  });

  it("resolve applies flag overrides on top", async () => {
    const { mgr } = await makeMgr();
    await mgr.set("network", "devnet");
    const cfg = mgr.resolve({ network: "mainnet-beta" });
    expect(cfg.network).toBe("mainnet-beta");
  });
});
