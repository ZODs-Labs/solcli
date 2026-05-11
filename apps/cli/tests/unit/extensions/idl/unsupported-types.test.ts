import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnchorIdl } from "@solcli/contracts";
import { IdlNotFoundError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import {
  synthesizeCommands,
  UNSUPPORTED_TYPES_MESSAGE,
} from "../../../../src/extensions/idl-synth.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "../../../fixtures/idl");

async function loadFixture(name: string): Promise<AnchorIdl> {
  const raw = await readFile(path.join(FIXTURES, name), "utf8");
  return JSON.parse(raw) as AnchorIdl;
}

describe("synthesizeCommands (unsupported types)", () => {
  it("emits a stub handler for an instruction whose arg uses a defined struct", async () => {
    const idl = await loadFixture("custom-struct.idl.json");
    const commands = synthesizeCommands(idl, { programLabel: "custom" });
    expect(commands).toHaveLength(1);
    const cmd = commands[0];
    if (!cmd) throw new Error("no command");
    expect(cmd.path).toBe("program.custom.dothing");
    expect(cmd.stability).toBe("alpha");
    expect(cmd.synthesized).toBe(true);
    expect(cmd.description.toLowerCase()).toContain("unsupported");
  });

  it("the stub handler throws SOLCLI_E_IDL_NOT_FOUND with the documented message", async () => {
    const idl = await loadFixture("custom-struct.idl.json");
    const commands = synthesizeCommands(idl, { programLabel: "custom" });
    const cmd = commands[0];
    if (!cmd) throw new Error("no command");
    let caught: unknown;
    try {
      await cmd.handler({}, {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IdlNotFoundError);
    if (caught instanceof IdlNotFoundError) {
      expect(caught.code).toBe("SOLCLI_E_IDL_NOT_FOUND");
      expect(caught.message).toBe(UNSUPPORTED_TYPES_MESSAGE);
      expect(caught.message).toContain("anchor-custom-types-decoder");
    }
  });
});
