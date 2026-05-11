import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  Blockhash,
  IntentEnvelope,
  Lamports,
  Pubkey,
  SignerAlias,
  TransactionPlan,
} from "@solcli/contracts";
import { SignerNotAvailableError, ValidationError } from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { createKeychainSignerAdapter } from "../../src/adapters/keychain.js";
import { base58Decode, base58Encode } from "../../src/base58.js";
import { ed25519PubkeyFromSeed } from "../../src/ed25519.js";
import { MemoryKeychainBackend } from "../helpers/memory-keychain.js";
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

function makePlan(): TransactionPlan {
  const payer = asPubkey("So11111111111111111111111111111111111111112");
  return {
    version: 0,
    payer,
    recentBlockhash: asBlockhash("EETUmEymExpUDFLbpXjGn5dKxoWFtAkugRdsLU6duuSt"),
    instructions: [
      {
        programId: asPubkey("11111111111111111111111111111111"),
        keys: [{ pubkey: payer, isSigner: true, isWritable: true }],
        data: new Uint8Array([5, 6, 7, 8]),
      },
    ],
    expectedSigners: [payer],
  };
}

function makeIntent(): IntentEnvelope {
  const payer = asPubkey("So11111111111111111111111111111111111111112");
  return {
    schemaVersion: 1,
    kind: "write-intent",
    summary: "keychain sign",
    payer,
    programs: [asPubkey("11111111111111111111111111111111")],
    lamportsDelta: lamports(0n),
    writableAccounts: [payer],
    costBudgetLamports: lamports(10_000n),
    idempotencyKey: "kc-001",
    signerAlias: "primary",
  };
}

async function makeSeed(): Promise<{ seed: Uint8Array; expanded: Uint8Array; pubkey: string }> {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = (i * 5 + 9) & 0xff;
  const pub = await ed25519PubkeyFromSeed(seed);
  const expanded = new Uint8Array(64);
  expanded.set(seed, 0);
  expanded.set(pub, 32);
  return { seed, expanded, pubkey: base58Encode(pub) };
}

describe("KeychainSignerAdapter", () => {
  it("round-trips set -> get -> sign -> verify pubkey with MemoryBackend", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "solcli-kc-"));
    const keychain = new MemoryKeychainBackend();
    const built = await buildTestDeps({ keychain, auditDir: path.join(dir, "audit") });
    const { expanded, pubkey } = await makeSeed();
    const ctrl = new AbortController();
    await keychain.set("solcli:signer:primary", expanded, ctrl.signal);
    const stored = await keychain.get("solcli:signer:primary", ctrl.signal);
    expect(stored).not.toBeNull();
    expect(stored?.length).toBe(64);

    const adapter = createKeychainSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("primary"),
      options: {},
    });

    const signed = await adapter.sign(asAlias("primary"), makePlan(), {
      signal: ctrl.signal,
      intent: makeIntent(),
    });
    expect(signed.signatures[0]?.signer as unknown as string).toBe(pubkey);

    const sigBytes = base58Decode(signed.signatures[0]?.signature as unknown as string);
    const pubBytes = base58Decode(pubkey);
    const spki = Buffer.concat([
      Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]),
      Buffer.from(pubBytes),
    ]);
    const pubKey = createPublicKey({ key: spki, format: "der", type: "spki" });
    const ok = cryptoVerify(
      null,
      Buffer.from(signed.serializedMessage),
      pubKey,
      Buffer.from(sigBytes),
    );
    expect(ok).toBe(true);

    const audit = await readFile(path.join(built.auditDir, "primary.ndjson"), "utf8");
    const parsed = JSON.parse(audit.split("\n").filter(Boolean)[0] ?? "{}");
    expect(parsed.adapter).toBe("keychain");
    expect(parsed.pubkey).toBe(pubkey);
  });

  it("uses custom keychainService when provided", async () => {
    const keychain = new MemoryKeychainBackend();
    const built = await buildTestDeps({ keychain });
    const { expanded, pubkey } = await makeSeed();
    const ctrl = new AbortController();
    await keychain.set("custom:key", expanded, ctrl.signal);

    const adapter = createKeychainSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("primary"),
      options: { keychainService: "custom:key" },
    });
    const signed = await adapter.sign(asAlias("primary"), makePlan(), {
      signal: ctrl.signal,
      intent: makeIntent(),
    });
    expect(signed.signatures[0]?.signer as unknown as string).toBe(pubkey);
  });

  it("rejects sign when keychain entry is missing", async () => {
    const built = await buildTestDeps({ keychain: new MemoryKeychainBackend() });
    const adapter = createKeychainSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("missing"),
      options: {},
    });
    const ctrl = new AbortController();
    await expect(
      adapter.sign(asAlias("missing"), makePlan(), {
        signal: ctrl.signal,
        intent: makeIntent(),
      }),
    ).rejects.toBeInstanceOf(SignerNotAvailableError);
  });

  it("rejects sign when keychain entry has wrong length", async () => {
    const keychain = new MemoryKeychainBackend();
    const built = await buildTestDeps({ keychain });
    const ctrl = new AbortController();
    await keychain.set("solcli:signer:primary", new Uint8Array([1, 2, 3]), ctrl.signal);
    const adapter = createKeychainSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("primary"),
      options: {},
    });
    await expect(
      adapter.sign(asAlias("primary"), makePlan(), {
        signal: ctrl.signal,
        intent: makeIntent(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("read returns pubkey when the keychain holds a valid key", async () => {
    const keychain = new MemoryKeychainBackend();
    const { expanded, pubkey } = await makeSeed();
    const built = await buildTestDeps({ keychain });
    const ctrl = new AbortController();
    await keychain.set("solcli:signer:primary", expanded, ctrl.signal);
    const adapter = createKeychainSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("primary"),
      options: {},
    });
    const info = await adapter.read(asAlias("primary"), { signal: ctrl.signal });
    expect(info.pubkey as unknown as string).toBe(pubkey);
  });
});
