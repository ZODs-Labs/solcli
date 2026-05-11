import type { Brand } from "./brand.js";

export type Signature = Brand<string, "Signature">;
export type Blockhash = Brand<string, "Blockhash">;
export type Slot = Brand<bigint, "Slot">;
export type BlockHeight = Brand<bigint, "BlockHeight">;
export type UnixSeconds = Brand<number, "UnixSeconds">;
