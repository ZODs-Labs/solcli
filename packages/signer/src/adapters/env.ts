import type {
  Pubkey,
  SignedTransaction,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignTransactionOptions,
  TransactionPlan,
} from "@solcli/contracts";
import { InternalError, SignerRefusedError, ValidationError } from "@solcli/errors";
import { base58Decode, base58Encode } from "../base58.js";
import { ed25519PubkeyFromSeed, extractSeed } from "../ed25519.js";
import type { SignerAdapter, SignerAdapterKind, SignerInitDeps } from "../port.js";
import { signWithKeyBytes } from "./common.js";

const KIND: SignerAdapterKind = "env";

const ALLOW_ENV_FLAG = "--signer-allow-env";

export class EnvSignerAdapter implements SignerAdapter {
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
    if (deps.allowEnv !== true) {
      throw new SignerRefusedError(`env signer requires explicit ${ALLOW_ENV_FLAG} opt-in`, {
        details: { flag: ALLOW_ENV_FLAG, alias: alias as unknown as string },
      });
    }
    const envVarName = resolveEnvVarName(alias, deps);
    const raw = deps.env[envVarName];
    if (raw === undefined || raw.length === 0) {
      throw new SignerRefusedError(
        `env signer secret not present in environment variable ${envVarName}`,
        { details: { envVarName, alias: alias as unknown as string } },
      );
    }
    deps.logger.warn(
      { alias: alias as unknown as string, envVarName },
      "env signer in use; secret read from environment",
    );
    const keyBytes = decodeKey(raw);
    return signWithKeyBytes({
      alias,
      adapter: KIND,
      plan,
      opts,
      deps,
      keyBytes,
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
    const envVarName = resolveEnvVarName(alias, deps);
    const raw = deps.env[envVarName];
    if (raw !== undefined && raw.length > 0) {
      try {
        const seed = extractSeed(decodeKey(raw));
        const pubBytes = ed25519PubkeyFromSeed(seed);
        seed.fill(0);
        info.pubkey = base58Encode(pubBytes) as unknown as Pubkey;
      } catch {
        // env var contained junk; surface no pubkey but do not throw on read
      }
    }
    return info;
  }

  async list(opts: SignerInfoOptions): Promise<readonly SignerInfo[]> {
    const deps = this.requireDeps();
    return [await this.read(deps.alias, opts)];
  }

  private requireDeps(): SignerInitDeps {
    if (this.deps === undefined) {
      throw new InternalError("EnvSignerAdapter used before init()");
    }
    return this.deps;
  }
}

export function createEnvSignerAdapter(): EnvSignerAdapter {
  return new EnvSignerAdapter();
}

function resolveEnvVarName(alias: SignerAlias, deps: SignerInitDeps): string {
  if (deps.options.envVarName !== undefined && deps.options.envVarName.length > 0) {
    return deps.options.envVarName;
  }
  const upper = (alias as unknown as string).toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `SOLCLI_SIGNER_${upper}_KEY`;
}

function decodeKey(raw: string): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = base58Decode(raw.trim());
  } catch (err: unknown) {
    throw new ValidationError("env signer key is not valid base58", {
      details: { reason: err instanceof Error ? err.message : String(err) },
    });
  }
  if (decoded.length !== 32 && decoded.length !== 64) {
    throw new ValidationError(
      `env signer key must decode to 32 or 64 bytes, got ${decoded.length}`,
      { details: { length: decoded.length } },
    );
  }
  return decoded;
}

/** The CLI flag name the env adapter reports when refusing to load. */
export const ENV_SIGNER_REQUIRED_FLAG = ALLOW_ENV_FLAG;
