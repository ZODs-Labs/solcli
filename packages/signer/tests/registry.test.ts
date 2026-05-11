import type { Pubkey, SignerAlias } from "@solcli/contracts";
import { SignerNotAvailableError, ValidationError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { createSignerRegistry } from "../src/registry.js";
import { createFakeAdapter, createFakeFactory } from "./helpers/fake-adapter.js";
import { buildTestDeps } from "./helpers/test-deps.js";

const FAKE_PUBKEY = "11111111111111111111111111111111" as unknown as Pubkey;

function asAlias(s: string): SignerAlias {
  return s as unknown as SignerAlias;
}

describe("createSignerRegistry", () => {
  it("round-trips add, list, get and remove with the memory keychain", async () => {
    const built = await buildTestDeps();
    const factory = createFakeFactory((kind) => createFakeAdapter(kind, FAKE_PUBKEY));
    const reg = createSignerRegistry({ ...built.deps, adapterFactory: factory });

    await reg.add(asAlias("primary"), "keychain", { keychainService: "solcli:signer:primary" });
    await reg.add(asAlias("hot"), "env", { envVarName: "SOLCLI_SIGNER_HOT_KEY" });

    const ctrl = new AbortController();
    const listed = await reg.list({ signal: ctrl.signal });
    expect(listed).toHaveLength(2);
    expect(listed.map((i) => i.alias as unknown as string).sort()).toEqual(["hot", "primary"]);
    expect(listed.every((i) => i.pubkey === FAKE_PUBKEY)).toBe(true);

    const adapter = await reg.get(asAlias("primary"), { signal: ctrl.signal });
    expect(adapter.kind).toBe("keychain");

    await reg.remove(asAlias("primary"));
    await expect(reg.get(asAlias("primary"), { signal: ctrl.signal })).rejects.toBeInstanceOf(
      SignerNotAvailableError,
    );

    const after = await reg.list({ signal: ctrl.signal });
    expect(after).toHaveLength(1);
    expect(after[0]?.alias as unknown as string).toBe("hot");
  });

  it("get caches the adapter and only calls init once", async () => {
    const built = await buildTestDeps();
    let created = 0;
    const factory = createFakeFactory((kind) => {
      created += 1;
      return createFakeAdapter(kind, FAKE_PUBKEY);
    });
    const reg = createSignerRegistry({ ...built.deps, adapterFactory: factory });
    await reg.add(asAlias("a"), "keychain", {});
    const ctrl = new AbortController();
    const first = await reg.get(asAlias("a"), { signal: ctrl.signal });
    const second = await reg.get(asAlias("a"), { signal: ctrl.signal });
    expect(first).toBe(second);
    expect(created).toBe(1);
  });

  it("rejects unknown kinds and duplicate aliases", async () => {
    const built = await buildTestDeps();
    const factory = createFakeFactory((kind) => createFakeAdapter(kind, FAKE_PUBKEY));
    const reg = createSignerRegistry({ ...built.deps, adapterFactory: factory });
    await expect(reg.add(asAlias("x"), "bogus" as unknown as "file", {})).rejects.toBeInstanceOf(
      ValidationError,
    );
    await reg.add(asAlias("dup"), "keychain", {});
    await expect(reg.add(asAlias("dup"), "keychain", {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("propagates abort signals from get", async () => {
    const built = await buildTestDeps();
    const factory = createFakeFactory((kind) => createFakeAdapter(kind, FAKE_PUBKEY));
    const reg = createSignerRegistry({ ...built.deps, adapterFactory: factory });
    await reg.add(asAlias("a"), "keychain", {});
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(reg.get(asAlias("a"), { signal: ctrl.signal })).rejects.toThrow();
  });

  it("dispose is invoked on remove for cached adapters", async () => {
    const built = await buildTestDeps();
    const made: ReturnType<typeof createFakeAdapter>[] = [];
    const factory = createFakeFactory((kind) => {
      const a = createFakeAdapter(kind, FAKE_PUBKEY);
      made.push(a);
      return a;
    });
    const reg = createSignerRegistry({ ...built.deps, adapterFactory: factory });
    await reg.add(asAlias("a"), "keychain", {});
    const ctrl = new AbortController();
    await reg.get(asAlias("a"), { signal: ctrl.signal });
    await reg.remove(asAlias("a"));
    expect(made[0]?.disposeCount).toBe(1);
  });
});
