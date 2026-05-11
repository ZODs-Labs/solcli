import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  KeychainBackend,
  SecretsCrypto,
  SignerLogger,
  SignerPlatform,
} from "../../src/port.js";
import type { SignerRegistryDeps } from "../../src/registry.js";
import { MemoryKeychainBackend } from "./memory-keychain.js";
import { testSecrets } from "./test-crypto.js";

export interface TestDepsOverrides {
  readonly secrets?: SecretsCrypto;
  readonly keychain?: KeychainBackend;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly allowEnv?: boolean;
  readonly logger?: SignerLogger;
  readonly dataDir?: string;
  readonly auditDir?: string;
  readonly clock?: () => number;
}

export interface BuiltTestDeps {
  readonly dataDir: string;
  readonly auditDir: string;
  readonly logger: CapturingLogger;
  readonly events: CapturingEvents;
  readonly keychain: KeychainBackend;
  readonly deps: Omit<SignerRegistryDeps, "adapterFactory">;
}

export class CapturingLogger implements SignerLogger {
  readonly debugCalls: Array<{ o: object; msg: string }> = [];
  readonly warnCalls: Array<{ o: object; msg: string }> = [];
  debug(o: object, msg: string): void {
    this.debugCalls.push({ o, msg });
  }
  warn(o: object, msg: string): void {
    this.warnCalls.push({ o, msg });
  }
}

export class CapturingEvents {
  readonly emitted: Array<{
    schemaVersion: 1;
    kind: string;
    time: string;
    requestId: string;
    data: unknown;
  }> = [];
  emit(record: {
    schemaVersion: 1;
    kind: string;
    time: string;
    requestId: string;
    data: unknown;
  }): void {
    this.emitted.push(record);
  }
  async flush(): Promise<void> {
    // no-op
  }
}

export async function buildTestDeps(over: TestDepsOverrides = {}): Promise<BuiltTestDeps> {
  const root = over.dataDir ?? (await mkdtemp(path.join(tmpdir(), "solcli-signer-")));
  const auditDir = over.auditDir ?? path.join(root, "audit");
  const logger = (over.logger as CapturingLogger | undefined) ?? new CapturingLogger();
  const events = new CapturingEvents();
  const keychain = over.keychain ?? new MemoryKeychainBackend();
  const platform: SignerPlatform = {
    dataDir: () => root,
    auditDir: () => auditDir,
  };
  let clockTick = 1_700_000_000_000;
  const clock = over.clock ?? (() => clockTick++);
  let requestSeq = 0;
  const newRequestId = () => `req-test-${++requestSeq}`;
  return {
    dataDir: root,
    auditDir,
    logger,
    events,
    keychain,
    deps: {
      secrets: over.secrets ?? testSecrets,
      keychain,
      logger,
      events,
      platform,
      env: over.env ?? {},
      allowEnv: over.allowEnv ?? false,
      clock,
      newRequestId,
    },
  };
}
