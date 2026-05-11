import { describe, expect, it } from "vitest";
import type { Context } from "../../../src/context.js";
import { setCurrentContext, withContext } from "../../../src/context.js";

describe("Context AsyncLocalStorage", () => {
  it("withContext rejects when no Context is active", async () => {
    await expect(withContext(async () => "x")).rejects.toThrow();
  });

  it("setCurrentContext + withContext yields the stored ctx", async () => {
    const fake = { teardown: async () => {} } as unknown as Context;
    setCurrentContext(fake);
    const result = await withContext(async (c) => c);
    expect(result).toBe(fake);
  });
});
