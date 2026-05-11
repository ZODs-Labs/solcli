import type { EventRecord, IntentEnvelope } from "@solcli/contracts";
import { describe, expect, it } from "vitest";
import { emitIntent, summarizeIntent } from "../src/intent.js";
import { lam, pk, plan, simulation } from "./_fixtures.js";

describe("summarizeIntent", () => {
  it("rolls up programs, writable accounts and lamports delta", () => {
    const tp = plan({
      instructions: [
        {
          programId: pk("progA"),
          keys: [
            { pubkey: pk("w1"), isSigner: false, isWritable: true },
            { pubkey: pk("r1"), isSigner: false, isWritable: false },
          ],
          data: new Uint8Array(),
        },
        {
          programId: pk("progA"),
          keys: [{ pubkey: pk("w1"), isSigner: false, isWritable: true }],
          data: new Uint8Array(),
        },
        {
          programId: pk("progB"),
          keys: [{ pubkey: pk("w2"), isSigner: false, isWritable: true }],
          data: new Uint8Array(),
        },
      ],
    });
    const sim = simulation({
      feeLamports: lam(5000n),
      accountsDelta: [
        { pubkey: "w1", lamportsBefore: 100n, lamportsAfter: 60n },
        { pubkey: "w2", lamportsBefore: 0n, lamportsAfter: 25n },
      ],
    });
    const env = summarizeIntent(tp, sim, {
      costBudgetLamports: 1_000_000n,
      idempotencyKey: "key-1",
      signerAlias: "alice",
    });
    expect(env.schemaVersion).toBe(1);
    expect(env.kind).toBe("write-intent");
    expect(env.programs).toEqual(["progA", "progB"]);
    expect(env.writableAccounts).toEqual(["w1", "w2"]);
    expect(env.lamportsDelta).toBe(-15n);
    expect(env.costBudgetLamports).toBe(1_000_000n);
    expect(env.idempotencyKey).toBe("key-1");
    expect(env.signerAlias).toBe("alice");
  });

  it("uses opts.summary when supplied", () => {
    const env = summarizeIntent(plan(), simulation(), {
      costBudgetLamports: 1n,
      idempotencyKey: "k",
      signerAlias: "s",
      summary: "explicit summary text",
    });
    expect(env.summary).toBe("explicit summary text");
  });

  it("handles missing accountsDelta as zero", () => {
    const env = summarizeIntent(plan(), simulation(), {
      costBudgetLamports: 1n,
      idempotencyKey: "k",
      signerAlias: "s",
    });
    expect(env.lamportsDelta).toBe(0n);
  });
});

describe("emitIntent", () => {
  it("emits an intent.emitted EventRecord with injected clock and requestId", () => {
    const captured: EventRecord<"intent.emitted", IntentEnvelope>[] = [];
    const envelope = summarizeIntent(plan(), simulation(), {
      costBudgetLamports: 1n,
      idempotencyKey: "k",
      signerAlias: "s",
    });
    emitIntent(envelope, {
      emit: (r) => captured.push(r),
      clock: () => 0,
      requestId: "req-xyz",
    });
    expect(captured).toHaveLength(1);
    const first = captured[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.kind).toBe("intent.emitted");
    expect(first.requestId).toBe("req-xyz");
    expect(first.time).toBe("1970-01-01T00:00:00.000Z");
    expect(first.data).toBe(envelope);
  });

  it("does not call Date.now; uses the injected clock", () => {
    let calls = 0;
    const envelope = summarizeIntent(plan(), simulation(), {
      costBudgetLamports: 1n,
      idempotencyKey: "k",
      signerAlias: "s",
    });
    emitIntent(envelope, {
      emit: () => {},
      clock: () => {
        calls += 1;
        return 1234;
      },
      requestId: "r",
    });
    expect(calls).toBe(1);
  });
});
