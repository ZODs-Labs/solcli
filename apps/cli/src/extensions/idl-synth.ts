import { createHash, randomBytes } from "node:crypto";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  isSignerRole,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type {
  AccountMeta,
  AnchorIdl,
  AnchorIdlAccountMeta,
  AnchorIdlInstruction,
  Blockhash,
  Instruction,
  Pubkey,
  SignableTransactionMessage,
} from "@solcli/contracts";
import { IdlNotFoundError, ValidationError } from "@solcli/errors";

/**
 * Unsupported-types stub message. Kept stable so agents and downstream
 * tooling can grep for it.
 */
export const UNSUPPORTED_TYPES_MESSAGE =
  "Custom Anchor types not supported in v1; downstream flow: anchor-custom-types-decoder.";

export interface SynthesizedAccountInput {
  readonly name: string;
  readonly writable: boolean;
  readonly signer: boolean;
}

export interface SynthesizedArgInput {
  readonly name: string;
  readonly type: unknown;
  readonly typeTag: ResolvedTypeTag;
}

export interface SynthesizedCommand {
  readonly path: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly accounts: readonly SynthesizedAccountInput[];
  readonly args: readonly SynthesizedArgInput[];
  readonly stability: "alpha";
  readonly synthesized: true;
  readonly programLabel: string;
  readonly programId?: string | undefined;
  readonly handler: SynthesizedCommandHandler;
}

export type SynthesizedCommandHandler = (
  ctx: SynthesizerHandlerContext,
  flags: Readonly<Record<string, unknown>>,
) => Promise<SynthesizedCommandOutcome>;

export interface SynthesizerHandlerContext {
  readonly logger?: {
    readonly debug: (obj: Record<string, unknown>, msg: string) => void;
    readonly info: (obj: Record<string, unknown>, msg: string) => void;
  };
  readonly abortController?: { readonly signal: AbortSignal };
  readonly output?: { readonly write: <T>(payload: T) => Promise<void> };
  readonly ops?: { readonly txExecute?: TxExecuteFn };
}

export interface SynthesizedCommandPlanResult {
  readonly kind: "plan";
  readonly plan: SignableTransactionMessage;
  readonly programLabel: string;
  readonly instruction: string;
}

export interface SynthesizedCommandExecuteResult {
  readonly kind: "execute";
  readonly plan: SignableTransactionMessage;
  readonly programLabel: string;
  readonly instruction: string;
  readonly result: unknown;
}

export type SynthesizedCommandOutcome =
  | SynthesizedCommandPlanResult
  | SynthesizedCommandExecuteResult;

export interface TxExecuteOptions {
  readonly signal: AbortSignal;
  readonly idempotencyKey: string;
  readonly signerAlias: string;
  readonly simulate: boolean;
  readonly execute: boolean;
}

export type TxExecuteFn = (
  plan: SignableTransactionMessage,
  opts: TxExecuteOptions,
) => Promise<unknown>;

export interface JsonSchemaProperty {
  readonly type: "integer" | "string" | "boolean" | "array";
  readonly description?: string;
  readonly bigint?: true;
  readonly format?: string;
  readonly items?: JsonSchemaProperty;
}

export interface JsonSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

export interface SynthesizeOptions {
  readonly programLabel: string;
  readonly programId?: string;
}

const PRIMITIVE_NAMES = new Set([
  "u8",
  "u16",
  "u32",
  "u64",
  "u128",
  "i8",
  "i16",
  "i32",
  "i64",
  "i128",
  "bool",
  "string",
  "publicKey",
  "pubkey",
  "bytes",
]);

const SUPPORTED_PRIMITIVES = new Set([
  "u8",
  "u16",
  "u32",
  "u64",
  "i8",
  "i16",
  "i32",
  "i64",
  "bool",
  "string",
  "publicKey",
  "pubkey",
]);

export type ResolvedTypeTag =
  | { readonly kind: "primitive"; readonly name: SupportedPrimitive }
  | { readonly kind: "option"; readonly inner: ResolvedTypeTag }
  | { readonly kind: "vec"; readonly inner: ResolvedTypeTag }
  | { readonly kind: "array"; readonly inner: ResolvedTypeTag; readonly len: number }
  | { readonly kind: "unsupported"; readonly reason: string };

export type SupportedPrimitive =
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "i8"
  | "i16"
  | "i32"
  | "i64"
  | "bool"
  | "string"
  | "publicKey";

/**
 * Walks each instruction in the IDL and emits a SynthesizedCommand. Each
 * command exposes a handler that builds a SignableTransactionMessage from the parsed
 * flags and dispatches it via ctx.ops.txExecute when --execute or --simulate
 * is set, or returns the plan otherwise so callers can inspect it.
 */
export function synthesizeCommands(
  idl: AnchorIdl,
  opts: SynthesizeOptions,
): readonly SynthesizedCommand[] {
  const programLabel = opts.programLabel.toLowerCase();
  const programId = opts.programId ?? idl.address;
  const out: SynthesizedCommand[] = [];
  for (const ix of idl.instructions) {
    out.push(buildSynthesizedCommand(ix, { programLabel, programId }));
  }
  return Object.freeze(out);
}

function buildSynthesizedCommand(
  ix: AnchorIdlInstruction,
  opts: { programLabel: string; programId: string | undefined },
): SynthesizedCommand {
  const args: SynthesizedArgInput[] = ix.args.map((arg) => ({
    name: arg.name,
    type: arg.type,
    typeTag: classifyType(arg.type),
  }));
  const accounts: SynthesizedAccountInput[] = ix.accounts.map(toAccountInput);
  const inputSchema = buildInputSchema(ix.name, args, accounts);
  const unsupported = args.find((a) => isUnsupportedTag(a.typeTag));
  const path = `program.${opts.programLabel}.${ix.name.toLowerCase()}`;
  const description = unsupported
    ? `${ix.name} (unsupported: ${getUnsupportedReason(unsupported.typeTag)})`
    : `Synthesized command for ${ix.name}`;

  const handler: SynthesizedCommandHandler = unsupported
    ? createUnsupportedHandler(ix.name, unsupported.name, getUnsupportedReason(unsupported.typeTag))
    : createSupportedHandler({
        ix,
        args,
        accounts,
        programLabel: opts.programLabel,
        programId: opts.programId,
      });

  const cmd: SynthesizedCommand = {
    path,
    description,
    inputSchema,
    accounts,
    args,
    stability: "alpha",
    synthesized: true,
    programLabel: opts.programLabel,
    programId: opts.programId,
    handler,
  };
  return cmd;
}

function toAccountInput(account: AnchorIdlAccountMeta): SynthesizedAccountInput {
  return {
    name: account.name,
    writable: account.writable === true,
    signer: account.signer === true,
  };
}

function isUnsupportedTag(tag: ResolvedTypeTag): boolean {
  if (tag.kind === "unsupported") return true;
  if (tag.kind === "option" || tag.kind === "vec" || tag.kind === "array") {
    return isUnsupportedTag(tag.inner);
  }
  return false;
}

function getUnsupportedReason(tag: ResolvedTypeTag): string {
  if (tag.kind === "unsupported") return tag.reason;
  if (tag.kind === "option" || tag.kind === "vec" || tag.kind === "array") {
    return getUnsupportedReason(tag.inner);
  }
  return "unknown";
}

function createUnsupportedHandler(
  ixName: string,
  argName: string,
  reason: string,
): SynthesizedCommandHandler {
  return async () => {
    throw new IdlNotFoundError(UNSUPPORTED_TYPES_MESSAGE, {
      details: { instruction: ixName, argument: argName, reason },
    });
  };
}

function createSupportedHandler(input: {
  readonly ix: AnchorIdlInstruction;
  readonly args: readonly SynthesizedArgInput[];
  readonly accounts: readonly SynthesizedAccountInput[];
  readonly programLabel: string;
  readonly programId: string | undefined;
}): SynthesizedCommandHandler {
  return async (ctx, flags) => {
    const plan = buildTransactionPlan({
      ix: input.ix,
      args: input.args,
      accounts: input.accounts,
      programId: input.programId,
      flags,
    });
    const wantsExecute = readBool(flags["execute"]);
    const wantsSimulate = readBool(flags["simulate"]);
    if (!wantsExecute && !wantsSimulate) {
      return {
        kind: "plan",
        plan,
        programLabel: input.programLabel,
        instruction: input.ix.name,
      };
    }
    const dispatch = ctx.ops?.txExecute;
    if (!dispatch) {
      throw new ValidationError(
        "TransactionService is not wired; cannot execute or simulate synthesized command",
        { details: { instruction: input.ix.name } },
      );
    }
    const signal = ctx.abortController?.signal ?? new AbortController().signal;
    const idempotencyKey = readString(flags["idempotency-key"]) ?? `idl-${cryptoRandomId()}`;
    const signerAlias = readString(flags["signer"]) ?? "default";
    const result = await dispatch(plan, {
      signal,
      idempotencyKey,
      signerAlias,
      simulate: wantsSimulate,
      execute: wantsExecute,
    });
    return {
      kind: "execute",
      plan,
      programLabel: input.programLabel,
      instruction: input.ix.name,
      result,
    };
  };
}

export interface BuildPlanInput {
  readonly ix: AnchorIdlInstruction;
  readonly args: readonly SynthesizedArgInput[];
  readonly accounts: readonly SynthesizedAccountInput[];
  readonly programId: string | undefined;
  readonly flags: Readonly<Record<string, unknown>>;
}

export function buildTransactionPlan(input: BuildPlanInput): SignableTransactionMessage {
  if (input.programId === undefined || input.programId === "") {
    throw new ValidationError(
      "Synthesized command requires a programId; the cached IDL must declare it",
      { details: { instruction: input.ix.name } },
    );
  }
  const programAddress = input.programId as Pubkey;
  const dataParts: Uint8Array[] = [anchorSighash(input.ix.name)];
  for (const arg of input.args) {
    const raw = input.flags[arg.name];
    dataParts.push(encodeValue(arg.typeTag, raw, arg.name));
  }
  const data = concatBytes(dataParts);

  const accounts: AccountMeta[] = [];
  for (const account of input.accounts) {
    const flagName = accountFlagName(account.name);
    const value = input.flags[flagName] ?? input.flags[account.name];
    if (typeof value !== "string" || value === "") {
      throw new ValidationError(
        `Synthesized command requires account flag --${flagName} for instruction ${input.ix.name}`,
        { details: { instruction: input.ix.name, account: account.name } },
      );
    }
    accounts.push({
      address: value as Pubkey,
      role: roleFor(account.signer, account.writable),
    });
  }

  const payerFlag = readString(input.flags["payer"]);
  const payer =
    payerFlag !== undefined && payerFlag !== "" ? (payerFlag as Pubkey) : pickPayer(accounts);
  const blockhashFlag = readString(input.flags["recent-blockhash"]);
  const recentBlockhash = (blockhashFlag ?? "11111111111111111111111111111111") as Blockhash;

  const instruction: Instruction = {
    programAddress,
    accounts: Object.freeze(accounts),
    data,
  };
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: recentBlockhash, lastValidBlockHeight: 0n },
        m,
      ),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );
}

function roleFor(signer: boolean, writable: boolean): AccountRole {
  if (signer && writable) return AccountRole.WRITABLE_SIGNER;
  if (signer) return AccountRole.READONLY_SIGNER;
  if (writable) return AccountRole.WRITABLE;
  return AccountRole.READONLY;
}

function pickPayer(accounts: readonly AccountMeta[]): Pubkey {
  for (const meta of accounts) {
    if (isSignerRole(meta.role)) return meta.address;
  }
  if (accounts[0]) return accounts[0].address;
  throw new ValidationError("Synthesized command requires at least one account or a --payer flag");
}

/**
 * Returns the first 8 bytes of sha256("global:<ixName>"). This is the Anchor
 * instruction discriminator format used at the head of instruction data.
 */
export function anchorSighash(ixName: string): Uint8Array {
  const digest = createHash("sha256").update(`global:${ixName}`).digest();
  return digest.subarray(0, 8);
}

export function buildInstructionData(
  ix: AnchorIdlInstruction,
  args: Readonly<Record<string, unknown>>,
): Uint8Array {
  const classified = ix.args.map((arg) => ({ name: arg.name, typeTag: classifyType(arg.type) }));
  for (const c of classified) {
    if (isUnsupportedTag(c.typeTag)) {
      throw new IdlNotFoundError(UNSUPPORTED_TYPES_MESSAGE, {
        details: { instruction: ix.name, argument: c.name },
      });
    }
  }
  const parts: Uint8Array[] = [anchorSighash(ix.name)];
  for (const c of classified) {
    parts.push(encodeValue(c.typeTag, args[c.name], c.name));
  }
  return concatBytes(parts);
}

/**
 * Encodes a single value to its Anchor little-endian wire shape.
 */
function encodeValue(tag: ResolvedTypeTag, raw: unknown, name: string): Uint8Array {
  switch (tag.kind) {
    case "primitive":
      return encodePrimitive(tag.name, raw, name);
    case "option": {
      if (raw === null || raw === undefined) {
        return new Uint8Array([0]);
      }
      const inner = encodeValue(tag.inner, raw, name);
      const out = new Uint8Array(1 + inner.length);
      out[0] = 1;
      out.set(inner, 1);
      return out;
    }
    case "vec": {
      const items = readArray(raw, name);
      const len = items.length;
      const head = u32LE(len);
      const body = items.map((item) => encodeValue(tag.inner, item, name));
      return concatBytes([head, ...body]);
    }
    case "array": {
      const items = readArray(raw, name);
      if (items.length !== tag.len) {
        throw new ValidationError(
          `Expected fixed array of length ${tag.len} for '${name}', got ${items.length}`,
        );
      }
      const body = items.map((item) => encodeValue(tag.inner, item, name));
      return concatBytes(body);
    }
    case "unsupported":
      throw new IdlNotFoundError(UNSUPPORTED_TYPES_MESSAGE, {
        details: { argument: name, reason: tag.reason },
      });
  }
}

function encodePrimitive(name: SupportedPrimitive, raw: unknown, argName: string): Uint8Array {
  switch (name) {
    case "u8":
      return u8(readInt(raw, argName, 0n, 0xffn));
    case "u16":
      return u16LE(readInt(raw, argName, 0n, 0xffffn));
    case "u32":
      return u32(readInt(raw, argName, 0n, 0xffffffffn));
    case "u64":
      return u64LE(readBigInt(raw, argName));
    case "i8":
      return i8(readInt(raw, argName, -128n, 127n));
    case "i16":
      return i16LE(readInt(raw, argName, -32768n, 32767n));
    case "i32":
      return i32LE(readInt(raw, argName, -2147483648n, 2147483647n));
    case "i64":
      return i64LE(readBigInt(raw, argName));
    case "bool": {
      if (typeof raw === "boolean") return new Uint8Array([raw ? 1 : 0]);
      if (raw === "true" || raw === "1") return new Uint8Array([1]);
      if (raw === "false" || raw === "0" || raw === undefined || raw === null)
        return new Uint8Array([0]);
      throw new ValidationError(`Expected boolean for '${argName}'`);
    }
    case "string":
      return encodeString(raw, argName);
    case "publicKey":
      return decodeBase58Pubkey(readString(raw) ?? "", argName);
  }
}

function encodeString(raw: unknown, argName: string): Uint8Array {
  const value = readString(raw);
  if (value === undefined) {
    throw new ValidationError(`Expected string for '${argName}'`);
  }
  const bytes = new TextEncoder().encode(value);
  return concatBytes([u32LE(bytes.length), bytes]);
}

function u8(value: bigint): Uint8Array {
  return new Uint8Array([Number(value & 0xffn)]);
}

function i8(value: bigint): Uint8Array {
  const v = Number(value);
  const view = new DataView(new ArrayBuffer(1));
  view.setInt8(0, v);
  return new Uint8Array(view.buffer);
}

function u16LE(value: bigint): Uint8Array {
  const view = new DataView(new ArrayBuffer(2));
  view.setUint16(0, Number(value), true);
  return new Uint8Array(view.buffer);
}

function i16LE(value: bigint): Uint8Array {
  const view = new DataView(new ArrayBuffer(2));
  view.setInt16(0, Number(value), true);
  return new Uint8Array(view.buffer);
}

function u32(value: bigint): Uint8Array {
  return u32LE(Number(value));
}

function u32LE(value: number | bigint): Uint8Array {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, Number(value), true);
  return new Uint8Array(view.buffer);
}

function i32LE(value: bigint): Uint8Array {
  const view = new DataView(new ArrayBuffer(4));
  view.setInt32(0, Number(value), true);
  return new Uint8Array(view.buffer);
}

function u64LE(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new ValidationError("u64 cannot be negative");
  }
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, value, true);
  return new Uint8Array(view.buffer);
}

function i64LE(value: bigint): Uint8Array {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigInt64(0, value, true);
  return new Uint8Array(view.buffer);
}

function readInt(raw: unknown, argName: string, min: bigint, max: bigint): bigint {
  const b = readBigInt(raw, argName);
  if (b < min || b > max) {
    throw new ValidationError(
      `Value for '${argName}' out of range [${min.toString()}, ${max.toString()}]`,
    );
  }
  return b;
}

function readBigInt(raw: unknown, argName: string): bigint {
  if (typeof raw === "bigint") return raw;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
      throw new ValidationError(`Expected integer for '${argName}'`);
    }
    return BigInt(raw);
  }
  if (typeof raw === "string" && raw !== "") {
    try {
      return BigInt(raw);
    } catch {
      throw new ValidationError(`Expected integer for '${argName}'`);
    }
  }
  throw new ValidationError(`Expected integer for '${argName}'`);
}

function readString(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  return undefined;
}

function readBool(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "1") return true;
  return false;
}

function readArray(raw: unknown, argName: string): readonly unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    if (raw === "") return [];
    return raw.split(",");
  }
  throw new ValidationError(`Expected array for '${argName}'`);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58Pubkey(value: string, argName: string): Uint8Array {
  if (value === "") {
    throw new ValidationError(`Expected base58 pubkey for '${argName}'`);
  }
  const bytes = base58Decode(value);
  if (bytes.length !== 32) {
    throw new ValidationError(`Expected 32-byte pubkey for '${argName}', got ${bytes.length}`);
  }
  return bytes;
}

function base58Decode(input: string): Uint8Array {
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") zeros += 1;
  let num = 0n;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === undefined) {
      throw new ValidationError("Invalid base58 character");
    }
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new ValidationError(`Invalid base58 character: '${ch}'`);
    }
    num = num * 58n + BigInt(idx);
  }
  const tail: number[] = [];
  while (num > 0n) {
    tail.push(Number(num & 0xffn));
    num >>= 8n;
  }
  tail.reverse();
  const out = new Uint8Array(zeros + tail.length);
  for (let i = 0; i < tail.length; i += 1) {
    const value = tail[i];
    if (value !== undefined) out[zeros + i] = value;
  }
  return out;
}

function accountFlagName(name: string): string {
  return `account-${toKebab(name)}`;
}

function toKebab(name: string): string {
  return name
    .replace(/[_\s]+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function cryptoRandomId(): string {
  const buf = randomBytes(8);
  let out = "";
  for (let i = 0; i < buf.length; i += 1) {
    const byte = buf[i] ?? 0;
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Resolves an Anchor IDL type shape (legacy string or Anchor 0.30 object form)
 * to a tag the encoder understands.
 */
export function classifyType(t: unknown): ResolvedTypeTag {
  if (typeof t === "string") {
    if (SUPPORTED_PRIMITIVES.has(t)) {
      return { kind: "primitive", name: normalizePrimitiveName(t) };
    }
    if (PRIMITIVE_NAMES.has(t)) {
      return { kind: "unsupported", reason: `primitive ${t} not supported in v1` };
    }
    return { kind: "unsupported", reason: `defined type '${t}'` };
  }
  if (t === null || typeof t !== "object") {
    return { kind: "unsupported", reason: "unrecognized type shape" };
  }
  const obj = t as Record<string, unknown>;
  if ("option" in obj) {
    return { kind: "option", inner: classifyType(obj["option"]) };
  }
  if ("vec" in obj) {
    return { kind: "vec", inner: classifyType(obj["vec"]) };
  }
  if ("array" in obj) {
    const arr = obj["array"];
    if (Array.isArray(arr) && arr.length === 2 && typeof arr[1] === "number") {
      return { kind: "array", inner: classifyType(arr[0]), len: arr[1] };
    }
    return { kind: "unsupported", reason: "malformed array type" };
  }
  if ("defined" in obj) {
    const d = obj["defined"];
    const name =
      typeof d === "string"
        ? d
        : d !== null &&
            typeof d === "object" &&
            typeof (d as Record<string, unknown>)["name"] === "string"
          ? ((d as Record<string, unknown>)["name"] as string)
          : "<unknown>";
    return { kind: "unsupported", reason: `defined type '${name}'` };
  }
  if ("kind" in obj && typeof obj["kind"] === "string") {
    return { kind: "unsupported", reason: `kind '${String(obj["kind"])}'` };
  }
  return { kind: "unsupported", reason: "unrecognized type object" };
}

function normalizePrimitiveName(name: string): SupportedPrimitive {
  if (name === "pubkey") return "publicKey";
  return name as SupportedPrimitive;
}

function buildInputSchema(
  _ixName: string,
  args: readonly SynthesizedArgInput[],
  accounts: readonly SynthesizedAccountInput[],
): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const arg of args) {
    properties[arg.name] = propertyForTag(arg.typeTag);
    required.push(arg.name);
  }
  for (const account of accounts) {
    const key = accountFlagName(account.name);
    const flags: string[] = [];
    if (account.writable) flags.push("writable");
    if (account.signer) flags.push("signer");
    properties[key] = {
      type: "string",
      format: "pubkey",
      description: flags.length > 0 ? `pubkey (${flags.join(", ")})` : "pubkey",
    };
    required.push(key);
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function propertyForTag(tag: ResolvedTypeTag): JsonSchemaProperty {
  switch (tag.kind) {
    case "primitive":
      return primitiveProperty(tag.name);
    case "option":
      return propertyForTag(tag.inner);
    case "vec":
    case "array":
      return { type: "array", items: propertyForTag(tag.inner) };
    case "unsupported":
      return { type: "string", description: `unsupported: ${tag.reason}` };
  }
}

function primitiveProperty(name: SupportedPrimitive): JsonSchemaProperty {
  switch (name) {
    case "u8":
    case "u16":
    case "u32":
    case "i8":
    case "i16":
    case "i32":
      return { type: "integer" };
    case "u64":
    case "i64":
      return { type: "string", bigint: true, description: "decimal integer string" };
    case "bool":
      return { type: "boolean" };
    case "string":
      return { type: "string" };
    case "publicKey":
      return { type: "string", format: "pubkey" };
  }
}

export { accountFlagName };
