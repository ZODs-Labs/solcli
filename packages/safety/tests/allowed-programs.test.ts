import { describe, expect, it } from "vitest";
import { evaluateAllowedPrograms } from "../src/allowed-programs.js";
import { pk, plan } from "./_fixtures.js";

describe("evaluateAllowedPrograms", () => {
  it("passes when every program is in the allowlist", () => {
    const tp = plan({
      instructions: [
        { programAddress: pk("prog1"), accounts: [], data: new Uint8Array() },
        { programAddress: pk("prog2"), accounts: [], data: new Uint8Array() },
      ],
    });
    const v = evaluateAllowedPrograms(tp, new Set(["prog1", "prog2"]));
    expect(v.ok).toBe(true);
  });

  it("rejects when any program is not in the allowlist", () => {
    const tp = plan({
      instructions: [
        { programAddress: pk("prog1"), accounts: [], data: new Uint8Array() },
        { programAddress: pk("rogue"), accounts: [], data: new Uint8Array() },
      ],
    });
    const v = evaluateAllowedPrograms(tp, new Set(["prog1"]));
    expect(v.ok).toBe(false);
    expect(v.code).toBe("SOLCLI_E_SAFETY_PROGRAM_DENIED");
    expect(v.reason).toContain("rogue");
  });

  it("passes for an empty instructions list", () => {
    const tp = plan({ instructions: [] });
    const v = evaluateAllowedPrograms(tp, new Set());
    expect(v.ok).toBe(true);
  });
});
