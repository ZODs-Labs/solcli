import type { FeePolicy } from "@solcli/contracts";
import {
  SafetyBudgetExceededError,
  SafetyIntentRequiredError,
  TxBlockhashExpiredV2Error,
  TxSimulateFailedError,
} from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { createTransactionService } from "../src/index.js";
import {
  ALIAS,
  EXECUTE_OPTS_BASE,
  makeDeps,
  makePlan,
  makeSignedTransaction,
  makeSimulation,
  memoryCache,
  memoryEventsPort,
  NEXT_BLOCKHASH,
  PROGRAM,
  SIGNATURE_OK,
  stubBundlePort,
  stubFeePort,
  stubSignPort,
  stubSimulatePort,
} from "./fixtures.js";

const FEE_POLICY_RECENT: FeePolicy = { kind: "recent" };
const FEE_POLICY_NONE: FeePolicy = { kind: "none" };

function controller(): AbortController {
  return new AbortController();
}

describe("createTransactionService.execute happy path", () => {
  it("walks the 6 stages and returns Ok(signature)", async () => {
    const events = memoryEventsPort();
    const fee = stubFeePort(750n);
    const sign = stubSignPort();
    const simulate = stubSimulatePort();
    const deps = makeDeps({ events, fee, sign, simulate });
    const svc = createTransactionService(deps);

    const result = await svc.execute(
      makePlan(),
      { ...EXECUTE_OPTS_BASE, signal: controller().signal },
      ALIAS,
      FEE_POLICY_RECENT,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(SIGNATURE_OK);
    const kinds = events.records.map((r) => r.kind);
    expect(kinds).toContain("tx.build");
    expect(kinds).toContain("tx.simulate");
    expect(kinds).toContain("tx.fee.estimated");
    expect(kinds).toContain("intent.emitted");
    expect(kinds).toContain("tx.signed");
    expect(kinds).toContain("tx.sent");
    expect(kinds).toContain("tx.confirmed");
    expect(simulate.calls).toHaveLength(1);
    expect(fee.calls).toHaveLength(1);
    expect(sign.callLog).toHaveLength(1);
  });

  it("standalone simulate(plan) returns the simulation result", async () => {
    const simulate = stubSimulatePort(() => makeSimulation({ unitsConsumed: 4242 }));
    const deps = makeDeps({ simulate });
    const svc = createTransactionService(deps);
    const result = await svc.simulate(makePlan(), { signal: controller().signal });
    expect(result.unitsConsumed).toBe(4242);
  });

  it("policy.kind=none short-circuits the fee port", async () => {
    const fee = stubFeePort(999n);
    const deps = makeDeps({ fee });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      { ...EXECUTE_OPTS_BASE, signal: controller().signal },
      ALIAS,
      FEE_POLICY_NONE,
    );
    expect(result.ok).toBe(true);
    expect(fee.calls).toHaveLength(0);
  });
});

describe("abort propagation", () => {
  it("aborting before execute returns an AbortError", async () => {
    const ctrl = controller();
    ctrl.abort();
    const deps = makeDeps();
    const svc = createTransactionService(deps);
    await expect(
      svc.execute(
        makePlan(),
        { ...EXECUTE_OPTS_BASE, signal: ctrl.signal },
        ALIAS,
        FEE_POLICY_RECENT,
      ),
    ).rejects.toMatchObject({ name: expect.stringMatching(/AbortError/) });
  });

  it("aborting during simulate propagates", async () => {
    const ctrl = controller();
    const simulate = stubSimulatePort(() => {
      ctrl.abort();
      ctrl.signal.throwIfAborted();
      return makeSimulation();
    });
    const deps = makeDeps({ simulate });
    const svc = createTransactionService(deps);
    await expect(
      svc.execute(
        makePlan(),
        { ...EXECUTE_OPTS_BASE, signal: ctrl.signal },
        ALIAS,
        FEE_POLICY_RECENT,
      ),
    ).rejects.toBeDefined();
  });

  it("aborting during sign propagates", async () => {
    const ctrl = controller();
    const sign = {
      async sign() {
        ctrl.abort();
        ctrl.signal.throwIfAborted();
        return makeSignedTransaction();
      },
    };
    const deps = makeDeps({ sign });
    const svc = createTransactionService(deps);
    await expect(
      svc.execute(
        makePlan(),
        { ...EXECUTE_OPTS_BASE, signal: ctrl.signal },
        ALIAS,
        FEE_POLICY_RECENT,
      ),
    ).rejects.toBeDefined();
  });

  it("aborting during send propagates", async () => {
    const ctrl = controller();
    const deps = makeDeps({
      sendRawTransaction: async () => {
        ctrl.abort();
        ctrl.signal.throwIfAborted();
        return SIGNATURE_OK;
      },
    });
    const svc = createTransactionService(deps);
    await expect(
      svc.execute(
        makePlan(),
        { ...EXECUTE_OPTS_BASE, signal: ctrl.signal },
        ALIAS,
        FEE_POLICY_RECENT,
      ),
    ).rejects.toBeDefined();
  });

  it("aborting during confirm propagates", async () => {
    const ctrl = controller();
    const deps = makeDeps({
      confirmSignature: async () => {
        ctrl.abort();
        ctrl.signal.throwIfAborted();
        return { slot: 1, confirmationStatus: "confirmed" as const };
      },
    });
    const svc = createTransactionService(deps);
    await expect(
      svc.execute(
        makePlan(),
        { ...EXECUTE_OPTS_BASE, signal: ctrl.signal },
        ALIAS,
        FEE_POLICY_RECENT,
      ),
    ).rejects.toBeDefined();
  });
});

describe("blockhash refresh", () => {
  it("refreshes on the first BlockhashNotFound and succeeds on retry", async () => {
    let calls = 0;
    let refreshCalls = 0;
    const sign = stubSignPort();
    const deps = makeDeps({
      sign,
      sendRawTransaction: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("Transaction simulation failed: Blockhash not found");
        }
        return SIGNATURE_OK;
      },
      refreshBlockhash: async () => {
        refreshCalls += 1;
        return { blockhash: NEXT_BLOCKHASH, lastValidBlockHeight: 200n };
      },
    });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      { ...EXECUTE_OPTS_BASE, signal: controller().signal },
      ALIAS,
      FEE_POLICY_RECENT,
    );
    expect(result.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(sign.callLog).toHaveLength(2);
    expect(sign.callLog[1]?.plan.recentBlockhash).toBe(NEXT_BLOCKHASH);
  });

  it("3 consecutive BlockhashExpired returns Err(TxBlockhashExpiredV2Error)", async () => {
    let refreshCalls = 0;
    const deps = makeDeps({
      sendRawTransaction: async () => {
        throw new Error("Blockhash not found");
      },
      refreshBlockhash: async () => {
        refreshCalls += 1;
        return { blockhash: NEXT_BLOCKHASH, lastValidBlockHeight: 1n };
      },
    });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      { ...EXECUTE_OPTS_BASE, signal: controller().signal },
      ALIAS,
      FEE_POLICY_RECENT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TxBlockhashExpiredV2Error);
    }
    expect(refreshCalls).toBe(2);
  });
});

describe("rate-limit retry on send", () => {
  it("retries when sendRawTransaction throws RpcRateLimitError", async () => {
    const { RpcRateLimitError } = await import("@solcli/errors");
    let calls = 0;
    const deps = makeDeps({
      sendRawTransaction: async () => {
        calls += 1;
        if (calls === 1) {
          throw new RpcRateLimitError("rate limited", { details: { retryAfterMs: 1 } });
        }
        return SIGNATURE_OK;
      },
    });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      { ...EXECUTE_OPTS_BASE, signal: controller().signal },
      ALIAS,
      FEE_POLICY_RECENT,
    );
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });
});

describe("bundle routing", () => {
  it("via=jito routes through the bundle port and skips sendRawTransaction", async () => {
    const bundle = stubBundlePort();
    let rawCalls = 0;
    const policy: FeePolicy = { kind: "jito", tipLamports: 10_000n };
    const deps = makeDeps({
      bundle,
      sendRawTransaction: async () => {
        rawCalls += 1;
        throw new Error("should not be called");
      },
    });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      { ...EXECUTE_OPTS_BASE, signal: controller().signal, via: "jito" },
      ALIAS,
      policy,
    );
    expect(result.ok).toBe(true);
    expect(bundle.submitCalls).toHaveLength(1);
    expect(bundle.submitCalls[0]?.bundle.tipLamports).toBe(10_000n);
    expect(rawCalls).toBe(0);
  });
});

describe("idempotency", () => {
  it("returns the cached signature on replay without calling ports", async () => {
    const cached = JSON.stringify({ version: 1, ok: true, signature: SIGNATURE_OK });
    const cache = memoryCache({ "key-1": cached });
    const simulate = stubSimulatePort();
    const sign = stubSignPort();
    let sendCalls = 0;
    const deps = makeDeps({
      cache,
      simulate,
      sign,
      sendRawTransaction: async () => {
        sendCalls += 1;
        return SIGNATURE_OK;
      },
    });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      { ...EXECUTE_OPTS_BASE, signal: controller().signal },
      ALIAS,
      FEE_POLICY_RECENT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(SIGNATURE_OK);
    expect(simulate.calls).toHaveLength(0);
    expect(sign.callLog).toHaveLength(0);
    expect(sendCalls).toBe(0);
  });
});

describe("safety gates", () => {
  it("simulate-first rejects when opts.execute is false", async () => {
    const events = memoryEventsPort();
    const deps = makeDeps({ events });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      {
        idempotencyKey: "key-simulate-only",
        costBudgetLamports: 1_000_000n,
        allowedPrograms: [PROGRAM as unknown as string],
        execute: false,
        signal: controller().signal,
      },
      ALIAS,
      FEE_POLICY_RECENT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SafetyIntentRequiredError);
    }
    expect(events.records.some((r) => r.kind === "safety.gate.rejected")).toBe(true);
  });

  it("cost-budget rejects when the simulated outflow exceeds the budget", async () => {
    const simulate = stubSimulatePort(() =>
      makeSimulation({
        accountsDelta: [
          {
            pubkey: "PAYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA11",
            lamportsBefore: 10_000_000n,
            lamportsAfter: 1n,
          },
        ],
      }),
    );
    const events = memoryEventsPort();
    const deps = makeDeps({ simulate, events });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      {
        ...EXECUTE_OPTS_BASE,
        costBudgetLamports: 1_000n,
        signal: controller().signal,
      },
      ALIAS,
      FEE_POLICY_RECENT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SafetyBudgetExceededError);
    }
  });

  it("simulate failure returns TxSimulateFailedError and emits tx.failed", async () => {
    const events = memoryEventsPort();
    const simulate = stubSimulatePort(() => ({
      ok: false,
      logs: ["log line"],
      err: "InstructionError",
      feeLamports: 0n as ReturnType<typeof makeSimulation>["feeLamports"],
    }));
    const deps = makeDeps({ simulate, events });
    const svc = createTransactionService(deps);
    const result = await svc.execute(
      makePlan(),
      { ...EXECUTE_OPTS_BASE, signal: controller().signal },
      ALIAS,
      FEE_POLICY_RECENT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TxSimulateFailedError);
    }
    expect(events.records.some((r) => r.kind === "tx.failed")).toBe(true);
  });
});
