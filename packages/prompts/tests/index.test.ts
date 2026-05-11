import { NonInteractiveError } from "@solcli/errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClackPrompts } from "../src/index.js";

describe("ClackPrompts non-interactive guard", () => {
  let originalCi: string | undefined;
  let originalNoInput: string | undefined;
  beforeEach(() => {
    originalCi = process.env.CI;
    originalNoInput = process.env.NO_INPUT;
    delete process.env.CI;
    delete process.env.NO_INPUT;
  });
  afterEach(() => {
    if (originalCi !== undefined) process.env.CI = originalCi;
    if (originalNoInput !== undefined) process.env.NO_INPUT = originalNoInput;
  });

  it("text throws NonInteractiveError when noInput=true", async () => {
    const p = new ClackPrompts({ noInput: true });
    await expect(p.text({ message: "test" })).rejects.toBeInstanceOf(NonInteractiveError);
  });

  it("password throws NonInteractiveError when noInput=true", async () => {
    const p = new ClackPrompts({ noInput: true });
    await expect(p.password({ message: "pw" })).rejects.toBeInstanceOf(NonInteractiveError);
  });

  it("confirm throws NonInteractiveError when noInput=true", async () => {
    const p = new ClackPrompts({ noInput: true });
    await expect(p.confirm({ message: "ok?" })).rejects.toBeInstanceOf(NonInteractiveError);
  });

  it("select throws NonInteractiveError when noInput=true", async () => {
    const p = new ClackPrompts({ noInput: true });
    await expect(
      p.select({ message: "x", options: [{ value: "a", label: "A" }] }),
    ).rejects.toBeInstanceOf(NonInteractiveError);
  });

  it("text throws when CI env is set", async () => {
    process.env.CI = "true";
    const p = new ClackPrompts({});
    await expect(p.text({ message: "x" })).rejects.toBeInstanceOf(NonInteractiveError);
  });

  it("NonInteractiveError has exit code 40", async () => {
    const p = new ClackPrompts({ noInput: true });
    try {
      await p.text({ message: "x" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(NonInteractiveError);
      expect((e as NonInteractiveError).exitCode).toBe(40);
    }
  });
});
