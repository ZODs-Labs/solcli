import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecretError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { EncryptedFileBackend } from "../src/index.js";

async function makeBackend(passphrase = "test-passphrase-123") {
  const dir = await mkdtemp(join(tmpdir(), "solcli-sec-"));
  return {
    dir,
    backend: new EncryptedFileBackend({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      getMasterPassphrase: async () => passphrase,
    }),
  };
}

describe("EncryptedFileBackend", () => {
  it("backend() reports encrypted-file", async () => {
    const { backend } = await makeBackend();
    expect(backend.backend()).toBe("encrypted-file");
  });

  it("set then get round-trips", async () => {
    const { backend } = await makeBackend();
    await backend.set("helius.apiKey", "secret-value-12345");
    expect(await backend.get("helius.apiKey")).toBe("secret-value-12345");
  }, 30_000);

  it("get returns null for missing name", async () => {
    const { backend } = await makeBackend();
    expect(await backend.get("nonexistent")).toBeNull();
  });

  it("delete removes the entry", async () => {
    const { backend } = await makeBackend();
    await backend.set("k", "v");
    await backend.delete("k");
    expect(await backend.get("k")).toBeNull();
  }, 30_000);

  it("list returns names only", async () => {
    const { backend } = await makeBackend();
    await backend.set("a", "1");
    await backend.set("b", "2");
    const names = await backend.list();
    expect(names.sort()).toEqual(["a", "b"]);
  }, 30_000);

  it("tampered ciphertext throws SecretError", async () => {
    const { dir, backend } = await makeBackend();
    await backend.set("k", "value");
    const file = join(dir, "secrets.enc.ndjson");
    const raw = await readFile(file, "utf8");
    const tampered = raw.replace(/"ciphertext":"([^"]+)"/, (_m, ct: string) => {
      const flipped = ct.length > 1 ? `${ct.slice(0, 1)}A${ct.slice(2)}` : `A${ct.slice(1)}`;
      return `"ciphertext":"${flipped}"`;
    });
    await writeFile(file, tampered, "utf8");
    await expect(backend.get("k")).rejects.toBeInstanceOf(SecretError);
  }, 30_000);

  it("wrong master key throws SecretError", async () => {
    const { dir } = await makeBackend();
    const b1 = new EncryptedFileBackend({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      getMasterPassphrase: async () => "correct",
    });
    await b1.set("k", "v");
    const b2 = new EncryptedFileBackend({
      paths: { data: dir, config: dir, cache: dir, log: dir, temp: dir },
      getMasterPassphrase: async () => "wrong",
    });
    await expect(b2.get("k")).rejects.toBeInstanceOf(SecretError);
  }, 60_000);

  it("salt is persisted between operations", async () => {
    const { dir, backend } = await makeBackend("p");
    await backend.set("k", "v");
    const saltPath = join(dir, "secrets.salt");
    const salt = await readFile(saltPath);
    expect(salt.length).toBe(32);
  }, 30_000);
});
