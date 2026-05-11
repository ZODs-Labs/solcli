import { AsyncLocalStorage } from "node:async_hooks";
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
  InternalError,
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
import type { SignerRegistry } from "@solcli/signer";
import type { TransactionService } from "@solcli/tx";
import { bootstrapExtensionHost, type ExtensionHost } from "./extensions/host.js";
import { createOperations, type Operations } from "./operations/index.js";
import { createVersionCheck } from "./version-check.js";

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
  await registerConfiguredProviders(providers, secrets, resolved.provider);
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
    ops,
    versionCheck,
    errors,
    portNames: ALL_PORT_NAMES,
    abortController,
    flags,
    get tx(): TransactionService {
      if (_tx === undefined) {
        // The concrete TransactionService wiring is deferred to v1 once the
        // RPC client is available; until then commands resolve send/simulate
        // ports through ctx.providers directly.
        throw new InternalError(
          "ctx.tx is not yet wired (v1-deferred); use ctx.providers ports directly",
        );
      }
      return _tx;
    },
    get signers(): SignerRegistry {
      if (_signers === undefined) {
        // Same as ctx.tx: the SignerRegistry depends on the secrets-crypto
        // and adapter-factory wiring that lands with the v1 RPC client.
        throw new InternalError(
          "ctx.signers is not yet wired (v1-deferred); use SignTransactionPort directly",
        );
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

async function registerConfiguredProviders(
  providers: ProviderRegistry,
  secrets: SecretsStore,
  providerConfig: {
    active: string;
    fallback?: string[];
    helius?: ProviderVendorConfig;
    triton?: ProviderVendorConfig;
  },
): Promise<void> {
  for (const name of knownProviderNames) {
    const cfg = providerConfig[name];
    const referenced =
      providerConfig.active === name ||
      providerConfig.fallback?.includes(name) === true ||
      cfg !== undefined;
    if (!referenced) continue;
    if (cfg === undefined) {
      throw new ConfigError(
        `Provider '${name}' is referenced but provider.${name} is not configured`,
        {
          details: { provider: name },
        },
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
      providers.register(createHeliusProvider(providerOptions({ apiKey, endpoint: cfg.endpoint })));
    } else {
      providers.register(
        createTritonProvider(providerOptions({ apiKey, bearer, endpoint: cfg.endpoint })),
      );
    }
  }
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
