import { describe, expect, it } from "vitest";
import { evaluateAllowedPrograms } from "../src/allowed-programs.js";
import { pk, plan } from "./_fixtures.js";

describe("evaluateAllowedPrograms", () => {
  it("passes when every program is in the allowlist", () => {
    const tp = plan({
      instructions: [
        { programId: pk("prog1"), keys: [], data: new Uint8Array() },
        { programId: pk("prog2"), keys: [], data: new Uint8Array() },
      ],
    });
    const v = evaluateAllowedPrograms(tp, new Set(["prog1", "prog2"]));
    expect(v.ok).toBe(true);
  });

  it("rejects when any program is not in the allowlist", () => {
    const tp = plan({
      instructions: [
        { programId: pk("prog1"), keys: [], data: new Uint8Array() },
        { programId: pk("rogue"), keys: [], data: new Uint8Array() },
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
