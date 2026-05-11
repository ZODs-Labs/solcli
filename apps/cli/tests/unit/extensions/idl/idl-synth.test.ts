import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnchorIdl } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import {
  anchorSighash,
  buildInstructionData,
  buildTransactionPlan,
  classifyType,
  synthesizeCommands,
} from "../../../../src/extensions/idl-synth.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "../../../fixtures/idl");

async function loadFixture(name: string): Promise<AnchorIdl> {
  const raw = await readFile(path.join(FIXTURES, name), "utf8");
  return JSON.parse(raw) as AnchorIdl;
}

describe("anchorSighash", () => {
  it("returns the first 8 bytes of sha256('global:<ix>')", () => {
    // Reference: sha256("global:memo") = 0b04ed590bb7b10c... (first 8 bytes)
    const bytes = anchorSighash("memo");
    expect(bytes).toHaveLength(8);
    expect(Buffer.from(bytes).toString("hex")).toBe("0b04ed590bb7b10c");
  });

  it("differs across instruction names", () => {
    expect(Buffer.from(anchorSighash("memo")).toString("hex")).not.toBe(
      Buffer.from(anchorSighash("transfer")).toString("hex"),
    );
  });
});

describe("synthesizeCommands (memo IDL)", () => {
  it("emits one alpha-tier synthesized command per instruction", async () => {
    const idl = await loadFixture("memo.idl.json");
    const commands = synthesizeCommands(idl, { programLabel: "memo" });
    expect(commands).toHaveLength(1);
    const cmd = commands[0];
    if (!cmd) throw new Error("no command synthesized");
    expect(cmd.path).toBe("program.memo.memo");
    expect(cmd.stability).toBe("alpha");
    expect(cmd.synthesized).toBe(true);
    expect(cmd.args.map((a) => a.name)).toEqual(["message"]);
    expect(cmd.accounts.map((a) => a.name)).toEqual(["payer"]);
    expect(cmd.accounts[0]?.writable).toBe(true);
    expect(cmd.accounts[0]?.signer).toBe(true);
    expect(cmd.inputSchema.type).toBe("object");
    expect(cmd.inputSchema.required).toContain("message");
    expect(cmd.inputSchema.required).toContain("account-payer");
    expect(cmd.inputSchema.properties["message"]?.type).toBe("string");
  });

  it("builds an instruction data buffer with Anchor sighash + LP-string args", async () => {
    const idl = await loadFixture("memo.idl.json");
    const memoIx = idl.instructions[0];
    if (!memoIx) throw new Error("fixture missing memo instruction");
    const data = buildInstructionData(memoIx, { message: "hello" });
    const sighash = anchorSighash("memo");
    const lenLE = new Uint8Array(new Uint32Array([5]).buffer);
    const text = new TextEncoder().encode("hello");
    const expected = new Uint8Array(sighash.length + 4 + text.length);
    expected.set(sighash, 0);
    expected.set(lenLE, sighash.length);
    expected.set(text, sighash.length + 4);
    expect(Buffer.from(data).toString("hex")).toBe(Buffer.from(expected).toString("hex"));
  });

  it("buildTransactionPlan wires the keys, payer and instruction data", async () => {
    const idl = await loadFixture("memo.idl.json");
    const memoIx = idl.instructions[0];
    if (!memoIx) throw new Error("fixture missing memo instruction");
    const plan = buildTransactionPlan({
      ix: memoIx,
      args: memoIx.args.map((a) => ({
        name: a.name,
        type: a.type,
        typeTag: classifyType(a.type),
      })),
      accounts: memoIx.accounts.map((a) => ({
        name: a.name,
        writable: a.writable === true,
        signer: a.signer === true,
      })),
      programId: idl.address,
      flags: { message: "hello", "account-payer": "11111111111111111111111111111112" },
    });
    expect(plan.version).toBe(0);
    expect(plan.feePayer.address).toBe("11111111111111111111111111111112");
    expect(plan.instructions).toHaveLength(1);
    const ix = plan.instructions[0];
    if (!ix) throw new Error("plan has no instruction");
    expect(ix.programAddress).toBe("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    expect(ix.accounts).toHaveLength(1);
    expect(ix.accounts?.[0]?.address).toBe("11111111111111111111111111111112");
    // WRITABLE_SIGNER = 3 (signer & writable)
    expect(ix.accounts?.[0]?.role).toBe(3);
    if (!ix.data) throw new Error("instruction data missing");
    // Sighash + LP-length(5) + "hello" = 8 + 4 + 5 = 17 bytes.
    expect(ix.data.length).toBe(17);
    expect(Buffer.from(ix.data.slice(0, 8)).toString("hex")).toBe("0b04ed590bb7b10c");
  });

  it("returns the TransactionPlan when neither --simulate nor --execute is set", async () => {
    const idl = await loadFixture("memo.idl.json");
    const commands = synthesizeCommands(idl, { programLabel: "memo" });
    const cmd = commands[0];
    if (!cmd) throw new Error("no command");
    const outcome = await cmd.handler(
      {},
      {
        message: "hello",
        "account-payer": "11111111111111111111111111111112",
        simulate: false,
        execute: false,
      },
    );
    expect(outcome.kind).toBe("plan");
    if (outcome.kind !== "plan") return;
    expect(outcome.programLabel).toBe("memo");
    expect(outcome.instruction).toBe("memo");
    expect(outcome.plan.instructions).toHaveLength(1);
  });
});

describe("classifyType", () => {
  it("recognises primitives", () => {
    expect(classifyType("u8")).toEqual({ kind: "primitive", name: "u8" });
    expect(classifyType("u64")).toEqual({ kind: "primitive", name: "u64" });
    expect(classifyType("string")).toEqual({ kind: "primitive", name: "string" });
    expect(classifyType("publicKey")).toEqual({ kind: "primitive", name: "publicKey" });
  });

  it("walks option, vec and array shapes", () => {
    expect(classifyType({ option: "u32" })).toEqual({
      kind: "option",
      inner: { kind: "primitive", name: "u32" },
    });
    expect(classifyType({ vec: "u8" })).toEqual({
      kind: "vec",
      inner: { kind: "primitive", name: "u8" },
    });
    expect(classifyType({ array: ["u8", 4] })).toEqual({
      kind: "array",
      inner: { kind: "primitive", name: "u8" },
      len: 4,
    });
  });

  it("marks defined struct types as unsupported", () => {
    const tag = classifyType({ defined: "ComplexPayload" });
    expect(tag.kind).toBe("unsupported");
    if (tag.kind === "unsupported") {
      expect(tag.reason).toContain("ComplexPayload");
    }
  });
});
