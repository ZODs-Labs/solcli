import { RpcRateLimitError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { withRetries } from "../src/retries.js";

describe("withRetries", () => {
  it("returns the value on the first success", async () => {
    const ctrl = new AbortController();
    let calls = 0;
    const value = await withRetries(
      async (attempt) => {
        calls = attempt;
        return "ok";
      },
      { signal: ctrl.signal, retryOn: () => true },
    );
    expect(value).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries until success", async () => {
    const ctrl = new AbortController();
    let calls = 0;
    const value = await withRetries(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
        return "done";
      },
      {
        signal: ctrl.signal,
        retryOn: () => true,
        baseMs: 1,
        capMs: 5,
        rng: () => 0,
      },
    );
    expect(value).toBe("done");
    expect(calls).toBe(3);
  });

  it("honors Retry-After from RpcRateLimitError details", async () => {
    const ctrl = new AbortController();
    const start = Date.now();
    let calls = 0;
    await withRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new RpcRateLimitError("rate limit", { details: { retryAfterMs: 50 } });
        }
        return "ok";
      },
      {
        signal: ctrl.signal,
        retryOn: (err) => err instanceof RpcRateLimitError,
        baseMs: 1,
        capMs: 2,
        rng: () => 0,
      },
    );
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it("does not retry when retryOn returns false", async () => {
    const ctrl = new AbortController();
    let calls = 0;
    await expect(
      withRetries(
        async () => {
          calls += 1;
          throw new Error("hard");
        },
        { signal: ctrl.signal, retryOn: () => false },
      ),
    ).rejects.toThrow("hard");
    expect(calls).toBe(1);
  });

  it("aborts mid-loop when the signal fires", async () => {
    const ctrl = new AbortController();
    let _calls = 0;
    const run = withRetries(
      async () => {
        _calls += 1;
        throw new Error("transient");
      },
      {
        signal: ctrl.signal,
        retryOn: () => true,
        baseMs: 200,
        capMs: 1000,
        rng: () => 1,
      },
    );
    queueMicrotask(() => ctrl.abort());
    await expect(run).rejects.toBeDefined();
  });
});
