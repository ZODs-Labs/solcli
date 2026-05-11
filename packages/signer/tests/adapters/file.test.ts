import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import {
  NonInteractiveError,
  SignerNotAvailableError,
  SignerPermissionsInsecureError,
  ValidationError,
} from "@solcli/errors";
import { describe, expect, it } from "vitest";
import { createFileSignerAdapter } from "../../src/adapters/file.js";
import { base58Decode } from "../../src/base58.js";
import { writeKeystoreFile } from "../helpers/keystore-fixture.js";
import { buildTestDeps } from "../helpers/test-deps.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_KEYSTORE = path.resolve(HERE, "../fixtures/keystore.json");
const FIXTURE_PASSWORD = "fixture-password-1234";
const FIXTURE_PUBKEY = "BXq9CTas4DpibqUMCSbMHD5Q3rrNTx3JXekqC4GrKKHb";

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
          data: new Uint8Array([1, 2, 3, 4]),
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
    summary: "test transfer",
    payer,
    programs: [asPubkey("11111111111111111111111111111111")],
    lamportsDelta: lamports(1_000n),
    writableAccounts: [payer],
    costBudgetLamports: lamports(20_000n),
    idempotencyKey: "test-001",
    signerAlias: "primary",
  };
}

describe("FileSignerAdapter", () => {
  it("rejects a keystore with insecure POSIX mode", async () => {
    if (process.platform === "win32") return;
    const dir = await mkdtemp(path.join(tmpdir(), "solcli-file-"));
    const target = path.join(dir, "keystore.json");
    await copyFile(FIXTURE_KEYSTORE, target);
    await chmod(target, 0o644);

    const built = await buildTestDeps({ env: { SOLCLI_KEYSTORE_PASSWORD: FIXTURE_PASSWORD } });
    const adapter = createFileSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("primary"),
      options: { filePath: target },
    });
    const ctrl = new AbortController();
    await expect(
      adapter.sign(asAlias("primary"), makePlan(), {
        signal: ctrl.signal,
        intent: makeIntent(),
      }),
    ).rejects.toBeInstanceOf(SignerPermissionsInsecureError);
  });

  it("happy-path: decrypts fixture, emits intent, signs and writes audit", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "solcli-file-"));
    const target = path.join(dir, "keystore.json");
    await copyFile(FIXTURE_KEYSTORE, target);
    if (process.platform !== "win32") {
      await chmod(target, 0o600);
    }

    const built = await buildTestDeps({ env: { SOLCLI_KEYSTORE_PASSWORD: FIXTURE_PASSWORD } });
    const adapter = createFileSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("primary"),
      options: { filePath: target },
    });

    const ctrl = new AbortController();
    const signed = await adapter.sign(asAlias("primary"), makePlan(), {
      signal: ctrl.signal,
      intent: makeIntent(),
    });

    expect(signed.signatures).toHaveLength(1);
    expect(signed.signatures[0]?.signer as unknown as string).toBe(FIXTURE_PUBKEY);

    // The signature must verify against the fixture pubkey + serializedMessage.
    const sigBytes = base58Decode(signed.signatures[0]?.signature as unknown as string);
    expect(sigBytes.length).toBe(64);
    const pubBytes = base58Decode(FIXTURE_PUBKEY);
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

    // intent.emitted event was emitted before signature material existed.
    expect(built.events.emitted).toHaveLength(1);
    expect(built.events.emitted[0]?.kind).toBe("intent.emitted");

    // Audit line written.
    const auditFile = path.join(built.auditDir, "primary.ndjson");
    const audit = await readFile(auditFile, "utf8");
    const parsed = JSON.parse(audit.split("\n").filter(Boolean)[0] ?? "{}");
    expect(parsed.alias).toBe("primary");
    expect(parsed.adapter).toBe("file");
    expect(parsed.pubkey).toBe(FIXTURE_PUBKEY);
  });

  it("fails with NonInteractiveError when password env var is absent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "solcli-file-"));
    const target = path.join(dir, "keystore.json");
    await copyFile(FIXTURE_KEYSTORE, target);
    if (process.platform !== "win32") {
      await chmod(target, 0o600);
    }
    const built = await buildTestDeps({ env: {} });
    const adapter = createFileSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("primary"),
      options: { filePath: target },
    });
    const ctrl = new AbortController();
    await expect(
      adapter.sign(asAlias("primary"), makePlan(), {
        signal: ctrl.signal,
        intent: makeIntent(),
      }),
    ).rejects.toBeInstanceOf(NonInteractiveError);
  });

  it("init rejects missing filePath", async () => {
    const built = await buildTestDeps();
    const adapter = createFileSignerAdapter();
    await expect(
      adapter.init({
        ...built.deps,
        alias: asAlias("primary"),
        options: {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("read returns cached pubkey from the keystore JSON without decrypting", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "solcli-file-"));
    const target = path.join(dir, "keystore.json");
    await copyFile(FIXTURE_KEYSTORE, target);
    if (process.platform !== "win32") {
      await chmod(target, 0o600);
    }
    const built = await buildTestDeps();
    const adapter = createFileSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("primary"),
      options: { filePath: target },
    });
    const ctrl = new AbortController();
    const info = await adapter.read(asAlias("primary"), { signal: ctrl.signal });
    expect(info.adapter).toBe("file");
    expect(info.pubkey as unknown as string).toBe(FIXTURE_PUBKEY);
  });

  it("sign rejects when the keystore file does not exist", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "solcli-file-"));
    const built = await buildTestDeps({ env: { SOLCLI_KEYSTORE_PASSWORD: FIXTURE_PASSWORD } });
    const adapter = createFileSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("missing"),
      options: { filePath: path.join(dir, "absent.json") },
    });
    const ctrl = new AbortController();
    await expect(
      adapter.sign(asAlias("missing"), makePlan(), {
        signal: ctrl.signal,
        intent: makeIntent(),
      }),
    ).rejects.toBeInstanceOf(SignerNotAvailableError);
  });

  it("round-trips a freshly generated keystore via writeKeystoreFile", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "solcli-file-"));
    const built = await buildTestDeps({ env: { SOLCLI_KEYSTORE_PASSWORD: "round-trip-pw" } });
    const ks = await writeKeystoreFile(dir, { password: "round-trip-pw" });
    const adapter = createFileSignerAdapter();
    await adapter.init({
      ...built.deps,
      alias: asAlias("rt"),
      options: { filePath: ks.filePath },
    });
    const ctrl = new AbortController();
    const signed = await adapter.sign(asAlias("rt"), makePlan(), {
      signal: ctrl.signal,
      intent: makeIntent(),
    });
    expect(signed.signatures[0]?.signer as unknown as string).toBe(ks.pubkey);
  });
});
