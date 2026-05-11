import { describe, expect, it } from "vitest";
import { IDEMPOTENCY_TTL_MS, withIdempotency } from "../src/idempotency.js";
import { memoryCache } from "./fixtures.js";

describe("withIdempotency", () => {
  it("returns the deserialized cached value when present", async () => {
    const cache = memoryCache({ k: "42" });
    let ran = false;
    const out = await withIdempotency(
      "k",
      async () => {
        ran = true;
        return 0;
      },
      cache,
      (v) => String(v),
      (raw) => Number(raw),
    );
    expect(out).toBe(42);
    expect(ran).toBe(false);
  });

  it("runs the fn, caches and returns the value when not present", async () => {
    const cache = memoryCache();
    let calls = 0;
    const out = await withIdempotency(
      "k",
      async () => {
        calls += 1;
        return "hello";
      },
      cache,
      (v) => v,
      (raw) => raw,
    );
    expect(out).toBe("hello");
    expect(calls).toBe(1);
    expect(cache.store.get("k")).toBe("hello");
  });

  it("uses the default 24h TTL constant", () => {
    expect(IDEMPOTENCY_TTL_MS).toBe(86_400_000);
  });
});
