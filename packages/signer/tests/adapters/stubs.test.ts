import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type { Blockhash, IntentEnvelope, Lamports, Pubkey, SignerAlias } from "@solcli/contracts";
import { SignerNotAvailableError } from "@solcli/errors";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ledgerStub } from "../../src/adapters/ledger.stub.js";
import { remoteStub } from "../../src/adapters/remote.stub.js";
import { squadsStub } from "../../src/adapters/squads.stub.js";
import type {
  KeychainBackend,
  SecretsCrypto,
  SignableTransactionMessage,
  SignerAdapter,
  SignerInitDeps,
  SignerLogger,
  SignerPlatform,
  SignTransactionOptions,
} from "../../src/port.js";

function asAlias(s: string): SignerAlias {
  return s as unknown as SignerAlias;
}

const PAYER = "11111111111111111111111111111111" as unknown as Pubkey;
const PROGRAM = "11111111111111111111111111111112" as unknown as Pubkey;
const BLOCKHASH = "FwYJgr5qfQyU2t3vXLD46wGAVwYn4mxN5RZ2C4o9pAaa" as unknown as Blockhash;
const ZERO_LAMPORTS = 0n as unknown as Lamports;

function makePlan(): SignableTransactionMessage {
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(PAYER, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH, lastValidBlockHeight: 0n },
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        {
          programAddress: PROGRAM,
          accounts: [{ address: PAYER, role: AccountRole.WRITABLE_SIGNER }],
          data: new Uint8Array([0]),
        },
        m,
      ),
  );
}

function makeIntent(alias: string): IntentEnvelope {
  return {
    schemaVersion: 1,
    kind: "write-intent",
    summary: "stub sign attempt",
    payer: PAYER,
    programs: [PROGRAM],
    lamportsDelta: ZERO_LAMPORTS,
    writableAccounts: [PAYER],
    costBudgetLamports: ZERO_LAMPORTS,
    idempotencyKey: "test-key",
    signerAlias: alias,
  };
}

function makeSignOpts(alias: string): SignTransactionOptions {
  return {
    signal: new AbortController().signal,
    intent: makeIntent(alias),
  };
}

const noopSecrets: SecretsCrypto = {
  async encrypt() {
    return new Uint8Array();
  },
  async decrypt() {
    return new Uint8Array();
  },
};

const noopKeychain: KeychainBackend = {
  async get() {
    return null;
  },
  async set() {
    return;
  },
  async delete() {
    return;
  },
  async list() {
    return [];
  },
};

const noopLogger: SignerLogger = {
  debug() {},
  warn() {},
};

const noopPlatform: SignerPlatform = {
  dataDir: () => "/tmp/solcli-stub",
  auditDir: () => "/tmp/solcli-stub/audit",
};

function makeInitDeps(alias: SignerAlias): SignerInitDeps {
  return {
    alias,
    options: {},
    secrets: noopSecrets,
    keychain: noopKeychain,
    logger: noopLogger,
    platform: noopPlatform,
    env: {},
    allowEnv: false,
    clock: () => 0,
    newRequestId: () => "req-stub",
  };
}

describe("signer adapter stubs", () => {
  it("type-asserts that each stub satisfies SignerAdapter", () => {
    expectTypeOf(ledgerStub).toMatchTypeOf<SignerAdapter>();
    expectTypeOf(squadsStub).toMatchTypeOf<SignerAdapter>();
    expectTypeOf(remoteStub).toMatchTypeOf<SignerAdapter>();
  });

  it("ledger stub: sign rejects with SOLCLI_E_SIGNER_NOT_AVAILABLE and read returns adapter='ledger' with no pubkey", async () => {
    const alias = asAlias("ledger-1");
    const signal = new AbortController().signal;

    await expect(ledgerStub.init(makeInitDeps(alias))).resolves.toBeUndefined();

    const rej = ledgerStub.sign(alias, makePlan(), makeSignOpts("ledger-1"));
    await expect(rej).rejects.toBeInstanceOf(SignerNotAvailableError);
    await expect(rej).rejects.toMatchObject({
      code: "SOLCLI_E_SIGNER_NOT_AVAILABLE",
      message: expect.stringContaining("ledger-hardware-signer integration"),
    });

    const info = await ledgerStub.read(alias, { signal });
    expect(info.adapter).toBe("ledger");
    expect(info.alias).toBe(alias);
    expect(info.pubkey).toBeUndefined();

    await expect(ledgerStub.list({ signal })).resolves.toEqual([]);
    await expect(ledgerStub.dispose()).resolves.toBeUndefined();
  });

  it("squads stub: sign rejects with SOLCLI_E_SIGNER_NOT_AVAILABLE and read returns adapter='squads' with no pubkey", async () => {
    const alias = asAlias("squads-1");
    const signal = new AbortController().signal;

    await expect(squadsStub.init(makeInitDeps(alias))).resolves.toBeUndefined();

    const rej = squadsStub.sign(alias, makePlan(), makeSignOpts("squads-1"));
    await expect(rej).rejects.toBeInstanceOf(SignerNotAvailableError);
    await expect(rej).rejects.toMatchObject({
      code: "SOLCLI_E_SIGNER_NOT_AVAILABLE",
      message: expect.stringContaining("squads-v4-integration"),
    });

    const info = await squadsStub.read(alias, { signal });
    expect(info.adapter).toBe("squads");
    expect(info.alias).toBe(alias);
    expect(info.pubkey).toBeUndefined();

    await expect(squadsStub.list({ signal })).resolves.toEqual([]);
    await expect(squadsStub.dispose()).resolves.toBeUndefined();
  });

  it("remote stub: sign rejects with SOLCLI_E_SIGNER_NOT_AVAILABLE and read returns adapter='remote' with no pubkey", async () => {
    const alias = asAlias("remote-1");
    const signal = new AbortController().signal;

    await expect(remoteStub.init(makeInitDeps(alias))).resolves.toBeUndefined();

    const rej = remoteStub.sign(alias, makePlan(), makeSignOpts("remote-1"));
    await expect(rej).rejects.toBeInstanceOf(SignerNotAvailableError);
    await expect(rej).rejects.toMatchObject({
      code: "SOLCLI_E_SIGNER_NOT_AVAILABLE",
      message: expect.stringContaining("remote-mtls-signer"),
    });

    const info = await remoteStub.read(alias, { signal });
    expect(info.adapter).toBe("remote");
    expect(info.alias).toBe(alias);
    expect(info.pubkey).toBeUndefined();

    await expect(remoteStub.list({ signal })).resolves.toEqual([]);
    await expect(remoteStub.dispose()).resolves.toBeUndefined();
  });

  it("each stub reports the correct discriminator kind", () => {
    expect(ledgerStub.kind).toBe("ledger");
    expect(squadsStub.kind).toBe("squads");
    expect(remoteStub.kind).toBe("remote");
  });
});
