import type { EmitEventPort } from "@solcli/contracts";
import { InternalError, SignerNotAvailableError, ValidationError } from "@solcli/errors";
import type {
  AddSignerOptions,
  KeychainBackend,
  SecretsCrypto,
  SignerAdapter,
  SignerAdapterDeps,
  SignerAdapterKind,
  SignerAlias,
  SignerInfo,
  SignerInfoOptions,
  SignerLogger,
  SignerPlatform,
} from "./port.js";

/**
 * Factory the registry consults to instantiate an adapter for a given kind.
 * Production wiring supplies a factory that selects the right adapter
 * module; tests supply a stub factory that returns an in-memory adapter.
 *
 * Splitting the factory out keeps the registry agnostic of the concrete
 * adapter modules; this is what lets B1 land before B2/B3.
 */
export interface SignerAdapterFactory {
  create(kind: SignerAdapterKind): SignerAdapter;
}

export interface SignerRegistryDeps {
  readonly secrets: SecretsCrypto;
  readonly keychain: KeychainBackend;
  readonly logger: SignerLogger;
  readonly events?: EmitEventPort;
  readonly platform: SignerPlatform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly allowEnv: boolean;
  readonly clock: () => number;
  readonly newRequestId: () => string;
  readonly adapterFactory: SignerAdapterFactory;
}

export interface SignerRegistry {
  get(alias: SignerAlias, opts?: SignerInfoOptions): Promise<SignerAdapter>;
  list(opts?: SignerInfoOptions): Promise<readonly SignerInfo[]>;
  add(alias: SignerAlias, kind: SignerAdapterKind, opts: AddSignerOptions): Promise<void>;
  remove(alias: SignerAlias): Promise<void>;
}

interface AliasRecord {
  readonly kind: SignerAdapterKind;
  readonly options: AddSignerOptions;
}

const VALID_KINDS: ReadonlySet<SignerAdapterKind> = new Set<SignerAdapterKind>([
  "file",
  "env",
  "keychain",
  "ledger",
  "squads",
  "remote",
]);

export function createSignerRegistry(deps: SignerRegistryDeps): SignerRegistry {
  const aliases = new Map<string, AliasRecord>();
  const adapters = new Map<string, SignerAdapter>();

  function aliasKey(alias: SignerAlias): string {
    return alias as unknown as string;
  }

  function neverSignal(): AbortSignal {
    return new AbortController().signal;
  }

  function adapterDeps(alias: SignerAlias, record: AliasRecord) {
    const base: SignerAdapterDeps = {
      secrets: deps.secrets,
      keychain: deps.keychain,
      logger: deps.logger,
      platform: deps.platform,
      env: deps.env,
      allowEnv: deps.allowEnv,
      clock: deps.clock,
      newRequestId: deps.newRequestId,
      ...(deps.events !== undefined ? { events: deps.events } : {}),
    };
    return { ...base, alias, options: record.options };
  }

  async function loadAdapter(alias: SignerAlias, record: AliasRecord): Promise<SignerAdapter> {
    const cached = adapters.get(aliasKey(alias));
    if (cached !== undefined) return cached;
    const adapter = deps.adapterFactory.create(record.kind);
    if (adapter.kind !== record.kind) {
      throw new InternalError(
        `adapter factory returned kind=${adapter.kind} for requested kind=${record.kind}`,
      );
    }
    await adapter.init(adapterDeps(alias, record));
    adapters.set(aliasKey(alias), adapter);
    return adapter;
  }

  async function readInfo(
    alias: SignerAlias,
    record: AliasRecord,
    signal: AbortSignal,
  ): Promise<SignerInfo> {
    const adapter = await loadAdapter(alias, record);
    return adapter.read(alias, { signal });
  }

  return {
    async add(alias, kind, opts) {
      if (!VALID_KINDS.has(kind)) {
        throw new ValidationError(`Unknown signer adapter kind: ${kind}`, {
          details: { kind, valid: [...VALID_KINDS] },
        });
      }
      if ((alias as unknown as string).length === 0) {
        throw new ValidationError("Signer alias must be non-empty");
      }
      if (aliases.has(aliasKey(alias))) {
        throw new ValidationError(`Signer alias already exists: ${aliasKey(alias)}`, {
          details: { alias: aliasKey(alias) },
        });
      }
      aliases.set(aliasKey(alias), { kind, options: opts });
    },

    async remove(alias) {
      const adapter = adapters.get(aliasKey(alias));
      adapters.delete(aliasKey(alias));
      aliases.delete(aliasKey(alias));
      if (adapter !== undefined) {
        await adapter.dispose();
      }
    },

    async get(alias, opts) {
      const record = aliases.get(aliasKey(alias));
      if (record === undefined) {
        throw new SignerNotAvailableError(`Signer alias not registered: ${aliasKey(alias)}`, {
          details: { alias: aliasKey(alias) },
        });
      }
      opts?.signal?.throwIfAborted();
      return loadAdapter(alias, record);
    },

    async list(opts) {
      const signal = opts?.signal ?? neverSignal();
      const out: SignerInfo[] = [];
      for (const [aliasStr, record] of aliases) {
        signal.throwIfAborted();
        try {
          const info = await readInfo(aliasStr as unknown as SignerAlias, record, signal);
          out.push(info);
        } catch (err: unknown) {
          deps.logger.warn(
            { alias: aliasStr, err: err instanceof Error ? err.message : String(err) },
            "signer info read failed; entry omitted from list",
          );
        }
      }
      return out;
    },
  };
}
