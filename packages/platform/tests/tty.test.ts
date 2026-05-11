import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isNonInteractive, shouldColor, supportsUnicode, terminalWidth } from "../src/index.js";

describe("output/tty", () => {
  let originalNoColor: string | undefined;
  let originalForceColor: string | undefined;
  let originalCi: string | undefined;
  let originalNoInput: string | undefined;

  beforeEach(() => {
    originalNoColor = process.env.NO_COLOR;
    originalForceColor = process.env.FORCE_COLOR;
    originalCi = process.env.CI;
    originalNoInput = process.env.NO_INPUT;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    delete process.env.CI;
    delete process.env.NO_INPUT;
  });
  afterEach(() => {
    if (originalNoColor !== undefined) process.env.NO_COLOR = originalNoColor;
    else delete process.env.NO_COLOR;
    if (originalForceColor !== undefined) process.env.FORCE_COLOR = originalForceColor;
    else delete process.env.FORCE_COLOR;
    if (originalCi !== undefined) process.env.CI = originalCi;
    else delete process.env.CI;
    if (originalNoInput !== undefined) process.env.NO_INPUT = originalNoInput;
    else delete process.env.NO_INPUT;
  });

  describe("shouldColor precedence", () => {
    it("explicit --no-color flag wins over everything", () => {
      process.env.FORCE_COLOR = "1";
      expect(shouldColor(true)).toBe(false);
    });

    it("FORCE_COLOR wins over NO_COLOR", () => {
      process.env.FORCE_COLOR = "1";
      process.env.NO_COLOR = "1";
      expect(shouldColor(false)).toBe(true);
    });

    it("NO_COLOR disables color when no flag and no FORCE_COLOR", () => {
      process.env.NO_COLOR = "1";
      expect(shouldColor(false)).toBe(false);
    });
  });

  describe("isNonInteractive", () => {
    it("returns true when --no-input flag is set", () => {
      expect(isNonInteractive(true)).toBe(true);
    });

    it("returns true when CI env is set", () => {
      process.env.CI = "true";
      expect(isNonInteractive(false)).toBe(true);
    });

    it("returns true when NO_INPUT env is set", () => {
      process.env.NO_INPUT = "1";
      expect(isNonInteractive(false)).toBe(true);
    });
  });

  describe("terminalWidth", () => {
    it("returns a positive number", () => {
      expect(terminalWidth()).toBeGreaterThan(0);
    });
  });

  describe("supportsUnicode", () => {
    it("returns true on non-Windows platforms", () => {
      if (process.platform !== "win32") expect(supportsUnicode()).toBe(true);
    });
  });
});
