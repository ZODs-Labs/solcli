import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deepMerge, envOverrides, resolveConfig } from "../src/index.js";

describe("deepMerge", () => {
  it("later wins for scalars", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("undefined does not overwrite", () => {
    expect(deepMerge({ a: 1 }, { a: undefined as unknown as number })).toEqual({ a: 1 });
  });

  it("merges nested objects", () => {
    const result = deepMerge<Record<string, unknown>>(
      { a: { x: 1 } as Record<string, unknown> },
      { a: { y: 2 } as Record<string, unknown> },
    );
    expect(result).toEqual({ a: { x: 1, y: 2 } });
  });

  it("arrays are replaced not concatenated", () => {
    expect(
      deepMerge({ a: [1, 2] as unknown as number[] }, { a: [3] as unknown as number[] }),
    ).toEqual({ a: [3] });
  });
});

describe("envOverrides", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [
    "SOLCLI_NETWORK",
    "SOLCLI_PROFILE",
    "SOLCLI_PROVIDER",
    "SOLCLI_RPC_PRIMARY",
    "SOLCLI_RPC_FALLBACK",
    "SOLCLI_RPC_TIMEOUT_MS",
    "SOLCLI_CACHE_ENABLED",
    "SOLCLI_CACHE_TTL",
    "SOLCLI_LOG_LEVEL",
    "SOLCLI_NO_INPUT",
    "NO_COLOR",
    "NO_UPDATE_NOTIFIER",
  ];
  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns empty object when no env vars are set", () => {
    expect(envOverrides({})).toEqual({});
  });

  it("reads SOLCLI_NETWORK", () => {
    expect(envOverrides({ SOLCLI_NETWORK: "devnet" })).toEqual({ network: "devnet" });
  });

  it("parses SOLCLI_RPC_FALLBACK as comma-separated", () => {
    const out = envOverrides({ SOLCLI_RPC_FALLBACK: "https://a.example,https://b.example" });
    expect(out.rpc?.fallback).toEqual(["https://a.example", "https://b.example"]);
  });

  it("interprets SOLCLI_NO_INPUT as boolean true when set", () => {
    expect(envOverrides({ SOLCLI_NO_INPUT: "1" })).toEqual({ noInput: true });
  });
});

describe("resolveConfig precedence", () => {
  it("flags win over env wins over file wins over defaults", () => {
    const out = resolveConfig({
      fileConfig: { network: "devnet" },
      envOverrides: { network: "testnet" },
      flags: { network: "mainnet-beta" },
    });
    expect(out.network).toBe("mainnet-beta");
  });

  it("file overrides defaults when env and flags absent", () => {
    const out = resolveConfig({ fileConfig: { network: "devnet" } });
    expect(out.network).toBe("devnet");
  });
});
