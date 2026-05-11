import type {
  Pubkey,
  SignedTransaction,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignTransactionOptions,
  TransactionPlan,
} from "@solcli/contracts";
import { InternalError, SignerNotAvailableError, ValidationError } from "@solcli/errors";
import { base58Encode } from "../base58.js";
import { ed25519PubkeyFromSeed, extractSeed } from "../ed25519.js";
import type { SignerAdapter, SignerAdapterKind, SignerInitDeps } from "../port.js";
import { signWithKeyBytes } from "./common.js";

const KIND: SignerAdapterKind = "keychain";

export class KeychainSignerAdapter implements SignerAdapter {
  readonly kind = KIND;
  private deps: SignerInitDeps | undefined;

  async init(deps: SignerInitDeps): Promise<void> {
    this.deps = deps;
  }

  async dispose(): Promise<void> {
    this.deps = undefined;
  }

  async sign(
    alias: SignerAlias,
    plan: TransactionPlan,
    opts: SignTransactionOptions,
  ): Promise<SignedTransaction> {
    const deps = this.requireDeps();
    opts.signal.throwIfAborted();
    const name = resolveKeyName(alias, deps);
    const stored = await deps.keychain.get(name, opts.signal);
    if (stored === null) {
      throw new SignerNotAvailableError(`Keychain entry not found: ${name}`, {
        details: { keychainName: name, alias: alias as unknown as string },
      });
    }
    if (stored.length !== 32 && stored.length !== 64) {
      throw new ValidationError(
        `Keychain entry ${name} must hold 32 or 64 bytes, got ${stored.length}`,
        { details: { length: stored.length } },
      );
    }
    return signWithKeyBytes({
      alias,
      adapter: KIND,
      plan,
      opts,
      deps,
      keyBytes: stored,
    });
  }

  async read(alias: SignerAlias, opts: SignerInfoOptions): Promise<SignerInfo> {
    const deps = this.requireDeps();
    opts.signal.throwIfAborted();
    const info: { -readonly [K in keyof SignerInfo]: SignerInfo[K] } = {
      alias,
      adapter: KIND,
    };
    if (deps.options.label !== undefined) info.label = deps.options.label;
    const name = resolveKeyName(alias, deps);
    const stored = await deps.keychain.get(name, opts.signal);
    if (stored !== null && (stored.length === 32 || stored.length === 64)) {
      const seed = extractSeed(stored);
      const pubBytes = await ed25519PubkeyFromSeed(seed);
      seed.fill(0);
      stored.fill(0);
      info.pubkey = base58Encode(pubBytes) as unknown as Pubkey;
    }
    return info;
  }

  async list(opts: SignerInfoOptions): Promise<readonly SignerInfo[]> {
    const deps = this.requireDeps();
    return [await this.read(deps.alias, opts)];
  }

  private requireDeps(): SignerInitDeps {
    if (this.deps === undefined) {
      throw new InternalError("KeychainSignerAdapter used before init()");
    }
    return this.deps;
  }
}

export function createKeychainSignerAdapter(): KeychainSignerAdapter {
  return new KeychainSignerAdapter();
}

function resolveKeyName(alias: SignerAlias, deps: SignerInitDeps): string {
  if (deps.options.keychainService !== undefined && deps.options.keychainService.length > 0) {
    return deps.options.keychainService;
  }
  return `solcli:signer:${alias as unknown as string}`;
}
