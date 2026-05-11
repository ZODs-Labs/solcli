import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installSignalHandlers,
  isWindowsTerminal,
  lineEnding,
  registerAbortController,
} from "../src/index.js";

describe("cross-platform", () => {
  let originalWT: string | undefined;
  let originalWTProfile: string | undefined;

  beforeEach(() => {
    originalWT = process.env.WT_SESSION;
    originalWTProfile = process.env.WT_PROFILE_ID;
  });
  afterEach(() => {
    if (originalWT === undefined) delete process.env.WT_SESSION;
    else process.env.WT_SESSION = originalWT;
    if (originalWTProfile === undefined) delete process.env.WT_PROFILE_ID;
    else process.env.WT_PROFILE_ID = originalWTProfile;
  });

  it("lineEnding returns LF on non-Windows", () => {
    if (process.platform !== "win32") expect(lineEnding()).toBe("\n");
    else expect(lineEnding()).toBe("\r\n");
  });

  it("isWindowsTerminal returns true when WT_SESSION is set", () => {
    process.env.WT_SESSION = "1234";
    expect(isWindowsTerminal()).toBe(true);
  });

  it("isWindowsTerminal returns false when WT_SESSION is unset", () => {
    delete process.env.WT_SESSION;
    delete process.env.WT_PROFILE_ID;
    expect(isWindowsTerminal()).toBe(false);
  });

  it("registerAbortController is callable without throwing", () => {
    const c = new AbortController();
    expect(() => registerAbortController(c)).not.toThrow();
  });

  it("installSignalHandlers does not throw when called multiple times", () => {
    expect(() => {
      installSignalHandlers();
      installSignalHandlers();
    }).not.toThrow();
  });
});
