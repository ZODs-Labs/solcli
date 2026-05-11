import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createCache } from "@solcli/cache";
import { createConfigManager } from "@solcli/config";
import type {
  Cache,
  ConfigManager,
  Logger,
  OutputFormat,
  OutputFormatter,
  Paths,
  PortName,
  PromptsService,
  ProviderRegistry,
  ProviderVendorConfig,
  SafetyEvaluatePort,
  SecretsStore,
  VersionCheck,
} from "@solcli/contracts";
import {
  ConfigError,
  NonInteractiveError,
  SafetyIntentRequiredError,
  SecretError,
  UsageError,
  ValidationError,
} from "@solcli/errors";
import { createDevnullSink, createEventWriter, type EventWriter } from "@solcli/events";
import { buildLogger } from "@solcli/logger";
import { createFormatter } from "@solcli/output";
import { buildPaths, registerAbortController } from "@solcli/platform";
import { createPrompts } from "@solcli/prompts";
import {
  ALL_PORT_NAMES,
  createHeliusProvider,
  createProviderRegistry,
  createTritonProvider,
} from "@solcli/providers";
import { createSafetyEvaluator } from "@solcli/safety";
import { createSecretsStore } from "@solcli/secrets";
import { createSignerRegistry, type SignerRegistry } from "@solcli/signer";
import type { TransactionService } from "@solcli/tx";
import { bootstrapExtensionHost, type ExtensionHost } from "./extensions/host.js";
import { createOperations, type Operations } from "./operations/index.js";
import { createVersionCheck } from "./version-check.js";
import { createKeychainBackend } from "./wiring/keychain-backend.js";
import { createSecretsCrypto } from "./wiring/secrets-crypto.js";
import { createSignerAdapter } from "./wiring/signer-adapter-factory.js";
import { asKitTxBackedProvider, createKitTransactionService } from "./wiring/tx-service.js";

export interface GlobalFlags {
  output: OutputFormat;
  network?: string;
  profile?: string;
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
  noInput: boolean;
  noCache: boolean;
  yes: boolean;
}

export interface Context {
  paths: Paths;
  logger: Logger;
  config: ConfigManager;
  secrets: SecretsStore;
  output: OutputFormatter;
  prompts: PromptsService;
  cache: Cache;
  providers: ProviderRegistry;
  /** Provider registrations that failed during bootstrap. Surfaced by `doctor`. */
  providerErrors: readonly ProviderRegistrationFailure[];
  ops: Operations;
  versionCheck: VersionCheck;
  errors: ErrorFactory;
  portNames: readonly PortName[];
  abortController: AbortController;
  flags: GlobalFlags;
  readonly tx: TransactionService;
  readonly signers: SignerRegistry;
  readonly safety: SafetyEvaluatePort;
  readonly events: EventWriter;
  readonly plugins: ExtensionHost;
  abort(reason?: string): void;
  teardown(): Promise<void>;
}

export interface ErrorFactory {
  usage(message: string, opts?: { details?: Record<string, unknown> }): UsageError;
  nonInteractive(
    message: string,
    opts?: { details?: Record<string, unknown> },
  ): NonInteractiveError;
  secret(message: string, opts?: { details?: Record<string, unknown> }): SecretError;
  validation(message: string, opts?: { details?: Record<string, unknown> }): ValidationError;
  safetyIntent(
    message: string,
    opts?: { details?: Record<string, unknown> },
  ): SafetyIntentRequiredError;
}

const errors: ErrorFactory = {
  usage: (message, opts) => new UsageError(message, opts),
  nonInteractive: (message, opts) => new NonInteractiveError(message, opts),
  secret: (message, opts) => new SecretError(message, opts),
  validation: (message, opts) => new ValidationError(message, opts),
  safetyIntent: (message, opts) => new SafetyIntentRequiredError(message, opts),
};

const storage = new AsyncLocalStorage<Context>();
const knownProviderNames = ["helius", "triton"] as const;

export function setCurrentContext(ctx: Context): void {
  storage.enterWith(ctx);
}

export function getCurrentContext(): Context | undefined {
  return storage.getStore();
}

export function withContext<T>(fn: (ctx: Context) => Promise<T> | T): Promise<T> {
  const ctx = storage.getStore();
  if (!ctx) {
    return Promise.reject(new Error("No active Context; buildContext() was not called"));
  }
  return Promise.resolve(fn(ctx));
}

async function readPackageJson(): Promise<{ name: string; version: string }> {
  const url = new URL(import.meta.url);
  let dir = new URL(".", url);
  for (let i = 0; i < 6; i += 1) {
    try {
      const candidate = new URL("package.json", dir);
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as { name: string; version: string };
      if (parsed.name) return { name: parsed.name, version: parsed.version ?? "0.0.0" };
    } catch {
      // walk upward
    }
    dir = new URL("..", dir);
  }
  return { name: "solcli", version: "0.0.0" };
}

export async function buildContext(flags: GlobalFlags): Promise<Context> {
  const paths = buildPaths("solcli");
  const config = await createConfigManager({ paths });
  const cliOverlay: Partial<{
    network: string;
    profile: string;
    noInput: boolean;
    noColor: boolean;
  }> = {
    noInput: flags.noInput,
    noColor: flags.noColor,
  };
  if (flags.network !== undefined) cliOverlay.network = flags.network;
  if (flags.profile !== undefined) cliOverlay.profile = flags.profile;
  const resolved = config.resolve(cliOverlay);

  const logger = await buildLogger({
    paths,
    level: resolved.log.level,
    verbose: flags.verbose,
    quiet: flags.quiet,
  });

  const secrets = createSecretsStore({ paths });

  const output = createFormatter({
    format: flags.output,
    noColor: flags.noColor || resolved.noColor,
    quiet: flags.quiet,
  });

  const prompts = createPrompts({ noInput: flags.noInput || resolved.noInput });

  const cache = createCache({
    paths,
    enabled: resolved.cache.enabled && !flags.noCache,
    ttlSecondsDefault: resolved.cache.ttlSecondsDefault,
  });

  const providers = createProviderRegistry({
    active: resolved.provider.active,
    fallbackOrder: resolved.provider.fallback ?? [],
  });
  const providerErrors = await registerConfiguredProviders(
    providers,
    secrets,
    logger,
    resolved.provider,
  );
  const ops = createOperations({ registry: providers, logger });

  const pkg = await readPackageJson();
  const versionCheck = createVersionCheck({
    pkg,
    quiet: flags.quiet,
    disabled: resolved.noUpdateNotifier,
  });

  const abortController = new AbortController();
  registerAbortController(abortController);

  // Lazy holders for the post-foundation services. Cold-start budget forbids
  // constructing these on `solcli --help` or `solcli --version`; the getters
  // below materialize each on first access.
  let _tx: TransactionService | undefined;
  let _signers: SignerRegistry | undefined;
  let _safety: SafetyEvaluatePort | undefined;
  let _events: EventWriter | undefined;
  let _plugins: ExtensionHost | undefined;

  const ctx: Context = {
    paths,
    logger,
    config,
    secrets,
    output,
    prompts,
    cache,
    providers,
    providerErrors,
    ops,
    versionCheck,
    errors,
    portNames: ALL_PORT_NAMES,
    abortController,
    flags,
    get tx(): TransactionService {
      if (_tx === undefined) {
        const activeProvider = providers.active();
        if (activeProvider === undefined) {
          throw new ConfigError(
            "ctx.tx requires a configured active provider; none registered (see `solcli doctor`)",
          );
        }
        const kit = asKitTxBackedProvider(activeProvider);
        if (kit === null) {
          throw new ConfigError(
            `Active provider '${activeProvider.manifest.name}' does not expose a Kit RPC client; ctx.tx is unavailable`,
            { details: { provider: activeProvider.manifest.name } },
          );
        }
        const simulatePort = activeProvider.port("simulateTransaction");
        if (simulatePort === undefined) {
          throw new ConfigError(
            `Active provider '${activeProvider.manifest.name}' does not implement simulateTransaction`,
            { details: { provider: activeProvider.manifest.name } },
          );
        }
        // tx-service uses a flat string cache for idempotency keys; the
        // global Cache is keyed by CacheKey records (namespace/call/params)
        // which is a different shape. Use a small in-process map here.
        const txMem = new Map<string, { value: string; expiresAt?: number }>();
        _tx = createKitTransactionService({
          provider: kit,
          signers: ctx.signers,
          simulate: simulatePort,
          cache: {
            async get(key: string) {
              const entry = txMem.get(key);
              if (!entry) return undefined;
              if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
                txMem.delete(key);
                return undefined;
              }
              return entry.value;
            },
            async set(key: string, value: string, ttlMs?: number) {
              const entry: { value: string; expiresAt?: number } = { value };
              if (ttlMs !== undefined) entry.expiresAt = Date.now() + ttlMs;
              txMem.set(key, entry);
            },
          },
          logger: {
            debug: (o: object, msg: string) => logger.debug(o, msg),
            info: (o: object, msg: string) => logger.info(o, msg),
            warn: (o: object, msg: string) => logger.warn(o, msg),
            trace: (o: object, msg: string) => logger.trace(o, msg),
          },
          newRequestId: () => `r_${randomUUID().slice(0, 8)}`,
        });
      }
      return _tx;
    },
    get signers(): SignerRegistry {
      if (_signers === undefined) {
        _signers = createSignerRegistry({
          secrets: createSecretsCrypto(),
          keychain: createKeychainBackend(secrets),
          logger: {
            debug: (o, msg) => logger.debug(o, msg),
            warn: (o, msg) => logger.warn(o, msg),
          },
          platform: {
            dataDir: () => paths.data,
            auditDir: () => `${paths.data}/audit`,
          },
          env: process.env,
          allowEnv: process.env["SOLCLI_SIGNER_ALLOW_ENV"] === "1",
          clock: () => Date.now(),
          newRequestId: () => `r_${randomUUID().slice(0, 8)}`,
          adapterFactory: { create: createSignerAdapter },
        });
      }
      return _signers;
    },
    get safety(): SafetyEvaluatePort {
      if (_safety === undefined) _safety = createSafetyEvaluator();
      return _safety;
    },
    get events(): EventWriter {
      if (_events === undefined) {
        _events = createEventWriter({ sink: createDevnullSink() });
      }
      return _events;
    },
    get plugins(): ExtensionHost {
      if (_plugins === undefined) _plugins = bootstrapExtensionHost({ paths, logger });
      return _plugins;
    },
    abort(reason?: string) {
      try {
        abortController.abort(reason ?? "abort");
      } catch {
        // best-effort
      }
    },
    async teardown() {
      try {
        await logger.flush();
      } catch {
        // best-effort
      }
      if (_events !== undefined) {
        try {
          await _events.close();
        } catch {
          // best-effort
        }
      }
    },
  };
  return ctx;
}

export interface ProviderRegistrationFailure {
  readonly provider: string;
  readonly code: string;
  readonly message: string;
}

async function registerConfiguredProviders(
  providers: ProviderRegistry,
  secrets: SecretsStore,
  logger: Logger,
  providerConfig: {
    active: string;
    fallback?: string[];
    helius?: ProviderVendorConfig;
    triton?: ProviderVendorConfig;
  },
): Promise<readonly ProviderRegistrationFailure[]> {
  const failures: ProviderRegistrationFailure[] = [];
  for (const name of knownProviderNames) {
    const cfg = providerConfig[name];
    const referenced =
      providerConfig.active === name ||
      providerConfig.fallback?.includes(name) === true ||
      cfg !== undefined;
    if (!referenced) continue;
    try {
      if (cfg === undefined) {
        throw new ConfigError(
          `Provider '${name}' is referenced but provider.${name} is not configured`,
          { details: { provider: name } },
        );
      }
      const apiKey = await readConfiguredSecret(secrets, name, cfg.apiKeySecret, "apiKeySecret");
      const bearer = await readConfiguredSecret(secrets, name, cfg.bearerSecret, "bearerSecret");
      if (apiKey === undefined && bearer === undefined) {
        throw new ConfigError(
          `Provider '${name}' requires apiKeySecret or bearerSecret in provider.${name}`,
          { details: { provider: name } },
        );
      }
      if (name === "helius") {
        providers.register(
          createHeliusProvider(providerOptions({ apiKey, endpoint: cfg.endpoint })),
        );
      } else {
        providers.register(
          createTritonProvider(providerOptions({ apiKey, bearer, endpoint: cfg.endpoint })),
        );
      }
    } catch (err) {
      // Provider misconfiguration must not crash the CLI bootstrap; commands
      // whose whole purpose is to fix the configuration (`config set`,
      // `secrets set`, `doctor`) need to keep working. Record the failure so
      // doctor can surface it, and let port-resolution fail later with a
      // clear typed error when an operation actually needs that provider.
      const isErr = err instanceof Error;
      const code =
        isErr && "code" in err && typeof (err as { code?: string }).code === "string"
          ? (err as { code: string }).code
          : "SOLCLI_E_PROVIDER_REGISTER_FAILED";
      const message = isErr ? err.message : String(err);
      failures.push({ provider: name, code, message });
      logger.warn(
        { provider: name, code, message },
        "provider registration failed; commands that depend on this provider will fail until configuration is fixed",
      );
    }
  }
  return failures;
}

function providerOptions<T extends Record<string, string | undefined>>(
  values: T,
): { [K in keyof T]?: string } {
  const out: Partial<Record<keyof T, string>> = {};
  for (const [key, value] of Object.entries(values) as Array<[keyof T, string | undefined]>) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function readConfiguredSecret(
  secrets: SecretsStore,
  provider: string,
  secretName: string | undefined,
  field: string,
): Promise<string | undefined> {
  if (secretName === undefined) return undefined;
  const value = await secrets.get(secretName);
  if (value === null) {
    throw new ConfigError(`Provider '${provider}' references missing secret '${secretName}'`, {
      details: { provider, field, secretName },
    });
  }
  return value;
}
