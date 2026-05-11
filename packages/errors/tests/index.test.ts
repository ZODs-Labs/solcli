import { describe, expect, it } from "vitest";
import {
  ConfigError,
  ERROR_CODES,
  InternalError,
  NonInteractiveError,
  ProviderCapabilityUnsupportedError,
  SecretError,
  toSolcliError,
  UsageError,
} from "../src/index.js";

describe("SolcliError hierarchy", () => {
  it("UsageError has code SOLCLI_E_USAGE and exit code 2", () => {
    const e = new UsageError("bad args");
    expect(e.code).toBe(ERROR_CODES.USAGE);
    expect(e.exitCode).toBe(2);
    expect(e.message).toBe("bad args");
  });

  it("ConfigError has code SOLCLI_E_CONFIG and exit code 10", () => {
    expect(new ConfigError("x").exitCode).toBe(10);
  });

  it("SecretError has exit code 11", () => {
    expect(new SecretError("x").exitCode).toBe(11);
  });

  it("ProviderCapabilityUnsupportedError has exit 31", () => {
    const e = new ProviderCapabilityUnsupportedError("nope");
    expect(e.code).toBe(ERROR_CODES.PROVIDER_CAPABILITY_UNSUPPORTED);
    expect(e.exitCode).toBe(31);
  });

  it("NonInteractiveError has exit 40", () => {
    expect(new NonInteractiveError("no tty").exitCode).toBe(40);
  });

  it("toEnvelope produces a structured envelope with schemaVersion 1", () => {
    const e = new UsageError("bad", { details: { flag: "--out" } });
    const env = e.toEnvelope();
    expect(env.schemaVersion).toBe(1);
    expect(env.code).toBe("SOLCLI_E_USAGE");
    expect(env.exitCode).toBe(2);
    expect(env.details).toEqual({ flag: "--out" });
    expect(env.cause).toBeNull();
  });

  it("toSolcliError wraps a generic Error as InternalError", () => {
    const wrapped = toSolcliError(new Error("kaboom"));
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.exitCode).toBe(70);
    expect(wrapped.message).toBe("kaboom");
  });

  it("toSolcliError passes SolcliError through unchanged", () => {
    const e = new ConfigError("cfg");
    expect(toSolcliError(e)).toBe(e);
  });

  it("toSolcliError wraps a non-Error value", () => {
    const wrapped = toSolcliError("string thrown");
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.message).toBe("string thrown");
  });

  it("envelope cause chain is preserved", () => {
    const inner = new SecretError("inner");
    const outer = new ConfigError("outer", { cause: inner });
    const env = outer.toEnvelope();
    expect(env.cause).not.toBeNull();
    expect(env.cause?.code).toBe("SOLCLI_E_SECRET");
  });
});
