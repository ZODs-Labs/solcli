import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type {
  Blockhash,
  IntentEnvelope,
  Lamports,
  Pubkey,
  SignableTransactionMessage,
  SignerAlias,
} from "@solcli/contracts";
import { SignerRefusedError, ValidationError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { createEnvSignerAdapter } from "../../src/adapters/env.js";
import { base58Encode } from "../../src/base58.js";
import { ed25519PubkeyFromSeed } from "../../src/ed25519.js";
import { buildTestDeps } from "../helpers/test-deps.js";

function asAlias(s: string): SignerAlias {
  return s as unknown as SignerAlias;
}
function asPubkey(s: string): Pubkey {
  return s as unknown as Pubkey;
}
function asBlockhash(s: string): Blockhash {
  return s as unknown as Blockhash;
}
function lamports(n: bigint): Lamports {
  return n as unknown as Lamports;
}

function makePlan(): SignableTransactionMessage {
  const payer = asPubkey("So11111111111111111111111111111111111111112");
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: asBlockhash("EETUmEymExpUDFLbpXjGn5dKxoWFtAkugRdsLU6duuSt"),
          lastValidBlockHeight: 0n,
        },
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        {
          programAddress: asPubkey("11111111111111111111111111111111"),
          accounts: [{ address: payer, role: AccountRole.WRITABLE_SIGNER }],
          data: new Uint8Array([9, 8, 7]),
        },
        m,
      ),
  );
}

function makeIntent(): IntentEnvelope {
  const payer = asPubkey("So11111111111111111111111111111111111111112");
  return {
    schemaVersion: 1,
    kind: "write-intent",
    summary: "env sign test",
    payer,
    programs: [asPubkey("11111111111111111111111111111111")],
    lamportsDelta: lamports(0n),
    writableAccounts: [payer],
    costBudgetLamports: lamports(10_000n),
    idempotencyKey: "env-001",
    signerAlias: "hot",
  };
}

async function makeKeyB58(): Promise<{ keyB58: string; pubkey: string }> {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = (i * 3 + 1) & 0xff;
  const expanded = new Uint8Array(64);
  expanded.set(seed, 0);
  const pub = await ed25519PubkeyFromSeed(seed);
  expanded.set(pub, 32);
  return { keyB58: base58Encode(expanded), pubkey: base58Encode(pub) };
}

describe("EnvSignerAdapter", () => {
  it("refuses when allowEnv is false even with env var set", async () => {
    const { keyB58 } = await makeKeyB58();
    const built = await buildTestDeps({
      env: { SOLCLI_SIGNER_HOT_KEY: keyB58 },
      allowEnv: false,
    });
    const adapter = createEnvSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("hot"),
      options: {},
    });
    const ctrl = new AbortController();
    await expect(
      adapter.sign(asAlias("hot"), makePlan(), {
        signal: ctrl.signal,
        intent: makeIntent(),
      }),
    ).rejects.toBeInstanceOf(SignerRefusedError);
  });

  it("refuses when env var is missing even with allowEnv=true", async () => {
    const built = await buildTestDeps({ env: {}, allowEnv: true });
    const adapter = createEnvSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("hot"),
      options: {},
    });
    const ctrl = new AbortController();
    await expect(
      adapter.sign(asAlias("hot"), makePlan(), {
        signal: ctrl.signal,
        intent: makeIntent(),
      }),
    ).rejects.toBeInstanceOf(SignerRefusedError);
  });

  it("happy path: signs and warns on every use", async () => {
    const { keyB58, pubkey } = await makeKeyB58();
    const built = await buildTestDeps({
      env: { SOLCLI_SIGNER_HOT_KEY: keyB58 },
      allowEnv: true,
      auditDir: path.join(await mkdtemp(path.join(tmpdir(), "solcli-env-")), "audit"),
    });
    const adapter = createEnvSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("hot"),
      options: {},
    });
    const ctrl = new AbortController();
    const signed = await adapter.sign(asAlias("hot"), makePlan(), {
      signal: ctrl.signal,
      intent: makeIntent(),
    });
    expect(signed.signatures[0]?.signer as unknown as string).toBe(pubkey);
    expect(built.logger.warnCalls.some((c) => c.msg.includes("env signer in use"))).toBe(true);

    const audit = await readFile(path.join(built.auditDir, "hot.ndjson"), "utf8");
    const parsed = JSON.parse(audit.split("\n").filter(Boolean)[0] ?? "{}");
    expect(parsed.adapter).toBe("env");
    expect(parsed.pubkey).toBe(pubkey);
    expect(built.events.emitted.some((e) => e.kind === "intent.emitted")).toBe(true);
  });

  it("read returns the derived pubkey when the env var is present", async () => {
    const { keyB58, pubkey } = await makeKeyB58();
    const built = await buildTestDeps({
      env: { SOLCLI_SIGNER_HOT_KEY: keyB58 },
      allowEnv: true,
    });
    const adapter = createEnvSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("hot"),
      options: {},
    });
    const ctrl = new AbortController();
    const info = await adapter.read(asAlias("hot"), { signal: ctrl.signal });
    expect(info.pubkey as unknown as string).toBe(pubkey);
  });

  it("rejects garbage base58 input on sign", async () => {
    const built = await buildTestDeps({
      env: { SOLCLI_SIGNER_HOT_KEY: "!!!not-base58!!!" },
      allowEnv: true,
    });
    const adapter = createEnvSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("hot"),
      options: {},
    });
    const ctrl = new AbortController();
    await expect(
      adapter.sign(asAlias("hot"), makePlan(), {
        signal: ctrl.signal,
        intent: makeIntent(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
