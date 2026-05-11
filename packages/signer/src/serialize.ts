import type { TransactionPlan } from "@solcli/contracts";

/**
 * Produce a deterministic byte representation of a `TransactionPlan` for
 * signing. The encoding is signer-internal and stable across calls; the
 * real wire encoding (legacy or v0) lives in `@solcli/tx` and is wired
 * by the wiring session.
 *
 * We sign over a canonical UTF-8 JSON of the plan's load-bearing fields.
 * Stable ordering of keys and explicit handling of `bigint` and
 * `Uint8Array` keeps the bytes reproducible.
 */
export function serializeMessage(plan: TransactionPlan): Uint8Array {
  const canonical = {
    version: plan.version,
    payer: plan.payer as unknown as string,
    recentBlockhash: plan.recentBlockhash as unknown as string,
    instructions: plan.instructions.map((ix) => ({
      programId: ix.programId as unknown as string,
      keys: ix.keys.map((k) => ({
        pubkey: k.pubkey as unknown as string,
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: bytesToHex(ix.data),
    })),
    addressLookupTables: plan.addressLookupTables?.map((p) => p as unknown as string),
    priorityFeeMicroLamportsPerCu:
      plan.priorityFeeMicroLamportsPerCu !== undefined
        ? plan.priorityFeeMicroLamportsPerCu.toString()
        : undefined,
    computeUnitLimit: plan.computeUnitLimit,
    expectedSigners: plan.expectedSigners.map((p) => p as unknown as string),
    tags: plan.tags,
  };
  return new TextEncoder().encode(JSON.stringify(canonical, sortReplacer));
}

function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

function sortReplacer(_key: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = obj[k];
  }
  return out;
}
