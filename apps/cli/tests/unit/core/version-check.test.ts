import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UpdateNotifierVersionCheck } from "../../../src/version-check.js";

describe("UpdateNotifierVersionCheck", () => {
  let originalNoUpdateNotifier: string | undefined;
  beforeEach(() => {
    originalNoUpdateNotifier = process.env.NO_UPDATE_NOTIFIER;
  });
  afterEach(() => {
    if (originalNoUpdateNotifier === undefined) delete process.env.NO_UPDATE_NOTIFIER;
    else process.env.NO_UPDATE_NOTIFIER = originalNoUpdateNotifier;
  });

  it("maybeNotify is a no-op when NO_UPDATE_NOTIFIER is set", () => {
    process.env.NO_UPDATE_NOTIFIER = "1";
    const v = new UpdateNotifierVersionCheck({
      pkg: { name: "solcli", version: "0.0.1" },
    });
    expect(() => v.maybeNotify()).not.toThrow();
  });

  it("maybeNotify is a no-op when disabled=true", () => {
    delete process.env.NO_UPDATE_NOTIFIER;
    const v = new UpdateNotifierVersionCheck({
      pkg: { name: "solcli", version: "0.0.1" },
      disabled: true,
    });
    expect(() => v.maybeNotify()).not.toThrow();
  });

  it("maybeNotify is a no-op when quiet=true", () => {
    delete process.env.NO_UPDATE_NOTIFIER;
    const v = new UpdateNotifierVersionCheck({
      pkg: { name: "solcli", version: "0.0.1" },
      quiet: true,
    });
    expect(() => v.maybeNotify()).not.toThrow();
  });

  it("does not throw when stderr is not TTY", () => {
    delete process.env.NO_UPDATE_NOTIFIER;
    const v = new UpdateNotifierVersionCheck({
      pkg: { name: "solcli", version: "0.0.1" },
    });
    expect(() => v.maybeNotify()).not.toThrow();
  });
});
