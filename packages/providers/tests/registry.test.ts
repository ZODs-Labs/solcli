import type {
  GetBalancePort,
  GetPortfolioPort,
  PortName,
  ProviderInstance,
} from "@solcli/contracts";
import { ProviderError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import {
  createProviderRegistry,
  defineManifest,
  makeProviderInstance,
  type PortBindings,
} from "../src/index.js";

const noopBalance: GetBalancePort = {
  async getBalance() {
    return 0n as never;
  },
};

const noopPortfolio: GetPortfolioPort = {
  async getPortfolio() {
    return {} as never;
  },
};

function fakeProvider(name: string, ports: PortName[]): ProviderInstance {
  const manifest = defineManifest(name, "1", ports);
  const bindings: PortBindings = {};
  for (const p of ports) {
    if (p === "getBalance") bindings.getBalance = noopBalance;
    if (p === "getPortfolio") bindings.getPortfolio = noopPortfolio;
  }
  return makeProviderInstance(manifest, bindings);
}

describe("InMemoryProviderRegistry", () => {
  it("active returns undefined when no provider is registered", () => {
    const r = createProviderRegistry();
    expect(r.active()).toBeUndefined();
  });

  it("active returns the configured provider when registered", () => {
    const helius = fakeProvider("helius", ["getPortfolio"]);
    const r = createProviderRegistry({ active: "helius", providers: [helius] });
    expect(r.active()?.manifest.name).toBe("helius");
  });

  it("byName looks up registered providers", () => {
    const a = fakeProvider("a", []);
    const r = createProviderRegistry({ providers: [a] });
    expect(r.byName("a")?.manifest.name).toBe("a");
    expect(r.byName("missing")).toBeUndefined();
  });

  it("capableFor lists providers in active-then-fallback order, skipping incapable", () => {
    const a = fakeProvider("a", ["getBalance"]);
    const b = fakeProvider("b", ["getBalance", "getPortfolio"]);
    const c = fakeProvider("c", ["getPortfolio"]);
    const r = createProviderRegistry({
      active: "b",
      providers: [a, b, c],
      fallbackOrder: ["c", "a"],
    });
    const portfolio = r.capableFor("getPortfolio").map((p) => p.manifest.name);
    expect(portfolio).toEqual(["b", "c"]);
    const balance = r.capableFor("getBalance").map((p) => p.manifest.name);
    expect(balance).toEqual(["b", "a"]);
  });

  it("capableFor returns an empty list when no provider supports the port", () => {
    const a = fakeProvider("a", ["getBalance"]);
    const r = createProviderRegistry({ active: "a", providers: [a] });
    expect(r.capableFor("getPortfolio")).toEqual([]);
  });

  it("setActive throws ProviderError for an unknown name", () => {
    const a = fakeProvider("a", []);
    const r = createProviderRegistry({ providers: [a] });
    expect(() => r.setActive("missing")).toThrow(ProviderError);
  });

  it("setFallbackOrder updates the chain used by capableFor", () => {
    const a = fakeProvider("a", ["getBalance"]);
    const b = fakeProvider("b", ["getBalance"]);
    const r = createProviderRegistry({ active: "a", providers: [a, b] });
    r.setFallbackOrder(["b"]);
    expect(r.capableFor("getBalance").map((p) => p.manifest.name)).toEqual(["a", "b"]);
  });
});

describe("manifest", () => {
  it("rejects bindings that don't match the manifest", () => {
    const manifest = defineManifest("v", "1", ["getBalance"]);
    expect(() => makeProviderInstance(manifest, {})).toThrow(/no binding/);
  });

  it("rejects extra bindings not declared in the manifest", () => {
    const manifest = defineManifest("v", "1", []);
    expect(() => makeProviderInstance(manifest, { getBalance: noopBalance })).toThrow(
      /not declared/,
    );
  });

  it("exposes manifest ports as runtime read-only", () => {
    const manifest = defineManifest("v", "1", ["getBalance"]);
    const mutable = manifest.ports as Set<PortName>;
    expect(typeof mutable.add).toBe("undefined");
    expect([...manifest.ports]).toEqual(["getBalance"]);
  });
});
