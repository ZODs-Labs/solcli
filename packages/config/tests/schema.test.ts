import { describe, expect, it } from "vitest";
import { ConfigFileSchema, ConfigSchema } from "../src/index.js";

describe("ConfigSchema", () => {
  it("applies all defaults when given empty object", () => {
    const out = ConfigSchema.parse({});
    expect(out.network).toBe("mainnet-beta");
    expect(out.profile).toBe("default");
    expect(out.provider.active).toBe("rpc-only");
    expect(out.cache.enabled).toBe(true);
    expect(out.cache.ttlSecondsDefault).toBe(300);
    expect(out.log.level).toBe("info");
    expect(out.noInput).toBe(false);
  });

  it("rejects invalid log level", () => {
    const result = ConfigSchema.safeParse({ log: { level: "verbose" } });
    expect(result.success).toBe(false);
  });

  it("rejects negative cache TTL", () => {
    const result = ConfigSchema.safeParse({ cache: { ttlSecondsDefault: -1 } });
    expect(result.success).toBe(false);
  });

  it("accepts provider fallback and vendor secret references", () => {
    const result = ConfigSchema.safeParse({
      provider: {
        active: "helius",
        fallback: ["triton"],
        helius: { apiKeySecret: "helius.apiKey", endpoint: "https://example.com" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider.fallback).toEqual(["triton"]);
      expect(result.data.provider.helius?.apiKeySecret).toBe("helius.apiKey");
    }
  });
});

describe("ConfigFileSchema", () => {
  it("accepts multiple profile sections", () => {
    const result = ConfigFileSchema.safeParse({
      default_profile: "default",
      default: { network: "mainnet-beta" },
      "devnet-test": { network: "devnet" },
    });
    expect(result.success).toBe(true);
  });
});
