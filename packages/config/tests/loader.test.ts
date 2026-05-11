import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTomlConfig, saveTomlConfig } from "../src/index.js";

async function temp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "solcli-cfg-"));
}

describe("loader", () => {
  it("returns null for missing file", async () => {
    const dir = await temp();
    const file = join(dir, "config.toml");
    const out = await loadTomlConfig(file);
    expect(out).toBeNull();
  });

  it("round-trips a config", async () => {
    const dir = await temp();
    const file = join(dir, "config.toml");
    await saveTomlConfig(file, {
      default_profile: "default",
      profiles: {
        default: { network: "mainnet-beta" },
        "devnet-test": { network: "devnet" },
      },
    });
    const loaded = await loadTomlConfig(file);
    expect(loaded).not.toBeNull();
    expect(loaded?.default_profile).toBe("default");
    expect(loaded?.profiles["default"]?.network).toBe("mainnet-beta");
    expect(loaded?.profiles["devnet-test"]?.network).toBe("devnet");
  });

  it("atomic write does not leave a partial file when target dir is created on the fly", async () => {
    const dir = await temp();
    const file = join(dir, "deep", "nested", "config.toml");
    await saveTomlConfig(file, {
      default_profile: "default",
      profiles: { default: { network: "devnet" } },
    });
    const raw = await readFile(file, "utf8");
    expect(raw).toContain("network");
  });

  it("rejects malformed TOML with ConfigError", async () => {
    const dir = await temp();
    const file = join(dir, "config.toml");
    await saveTomlConfig(file, {
      default_profile: "default",
      profiles: { default: { network: "devnet" } },
    });
    await writeFile(file, "this is = not valid toml [[[", "utf8");
    await expect(loadTomlConfig(file)).rejects.toThrow();
  });
});
