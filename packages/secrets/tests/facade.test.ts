import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSecretsStore } from "../src/index.js";

describe("createSecretsStore", () => {
  it("forceBackend: encrypted-file returns encrypted-file backend", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solcli-fac-"));
    const s = createSecretsStore({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      forceBackend: "encrypted-file",
      getMasterPassphrase: async () => "p",
    });
    expect(s.backend()).toBe("encrypted-file");
    await s.set("k", "v");
    expect(await s.get("k")).toBe("v");
  }, 30_000);

  it("forceBackend: keyring returns keyring backend (may not be operational)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solcli-fac-"));
    const s = createSecretsStore({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      forceBackend: "keyring",
    });
    expect(s.backend()).toBe("keyring");
  });

  it("auto mode picks one of the two", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solcli-fac-"));
    const s = createSecretsStore({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      getMasterPassphrase: async () => "p",
    });
    expect(["keyring", "encrypted-file"]).toContain(s.backend());
  });
});
