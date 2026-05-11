import type { ErrorEnvelope } from "@solcli/contracts";

export const ERROR_CODES = {
  GENERIC: "SOLCLI_E_GENERIC",
  USAGE: "SOLCLI_E_USAGE",
  INPUT_INVALID: "SOLCLI_E_INPUT_INVALID",
  CONFIG: "SOLCLI_E_CONFIG",
  SECRET: "SOLCLI_E_SECRET",
  NO_SIGNER: "SOLCLI_E_NO_SIGNER",
  RPC: "SOLCLI_E_RPC",
  RPC_TIMEOUT: "SOLCLI_E_RPC_TIMEOUT",
  RPC_RATELIMIT: "SOLCLI_E_RPC_RATELIMIT",
  BLOCKHASH_EXPIRED: "SOLCLI_E_BLOCKHASH_EXPIRED",
  INSUFFICIENT_FUNDS: "SOLCLI_E_INSUFFICIENT_FUNDS",
  SIM_FAILED: "SOLCLI_E_SIM_FAILED",
  PROVIDER: "SOLCLI_E_PROVIDER",
  PROVIDER_CAPABILITY_UNSUPPORTED: "SOLCLI_E_PROVIDER_CAPABILITY_UNSUPPORTED",
  NO_INPUT: "SOLCLI_E_NO_INPUT",
  EX_USAGE: "SOLCLI_E_EX_USAGE",
  EX_UNAVAILABLE: "SOLCLI_E_EX_UNAVAILABLE",
  INTERNAL: "SOLCLI_E_INTERNAL",
  IO: "SOLCLI_E_IO",
  SIGNER_NOT_AVAILABLE: "SOLCLI_E_SIGNER_NOT_AVAILABLE",
  SIGNER_REFUSED: "SOLCLI_E_SIGNER_REFUSED",
  SIGNER_PERMISSIONS_INSECURE: "SOLCLI_E_SIGNER_PERMISSIONS_INSECURE",
  SAFETY_BUDGET_EXCEEDED: "SOLCLI_E_SAFETY_BUDGET_EXCEEDED",
  SAFETY_INTENT_REQUIRED: "SOLCLI_E_SAFETY_INTENT_REQUIRED",
  SAFETY_PROGRAM_DENIED: "SOLCLI_E_SAFETY_PROGRAM_DENIED",
  TX_BLOCKHASH_EXPIRED: "SOLCLI_E_TX_BLOCKHASH_EXPIRED",
  TX_SIMULATE_FAILED: "SOLCLI_E_TX_SIMULATE_FAILED",
  PLUGIN_INVALID_MANIFEST: "SOLCLI_E_PLUGIN_INVALID_MANIFEST",
  PLUGIN_INTEGRITY_MISMATCH: "SOLCLI_E_PLUGIN_INTEGRITY_MISMATCH",
  PLUGIN_UNVERIFIED: "SOLCLI_E_PLUGIN_UNVERIFIED",
  IDL_NOT_FOUND: "SOLCLI_E_IDL_NOT_FOUND",
  MCP_TRANSPORT_UNSUPPORTED: "SOLCLI_E_MCP_TRANSPORT_UNSUPPORTED",
  EVENT_SINK_UNAVAILABLE: "SOLCLI_E_EVENT_SINK_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class SolcliError extends Error {
  readonly code: ErrorCode = ERROR_CODES.GENERIC;
  readonly exitCode: number = 1;
  readonly details?: Record<string, unknown>;
  readonly schemaVersion = 1 as const;
  override readonly cause?: SolcliError;

  constructor(
    message: string,
    opts?: { details?: Record<string, unknown>; cause?: SolcliError | Error },
  ) {
    super(message);
    this.name = this.constructor.name;
    if (opts?.details !== undefined) {
      this.details = opts.details;
    }
    if (opts?.cause !== undefined) {
      this.cause =
        opts.cause instanceof SolcliError ? opts.cause : new InternalError(opts.cause.message);
    }
  }

  toEnvelope(): ErrorEnvelope {
    const env: ErrorEnvelope = {
      schemaVersion: 1,
      code: this.code,
      message: this.message,
      exitCode: this.exitCode,
    };
    if (this.details !== undefined) env.details = this.details;
    env.cause = this.cause ? this.cause.toEnvelope() : null;
    return env;
  }
}

export class UsageError extends SolcliError {
  override readonly code = ERROR_CODES.USAGE;
  override readonly exitCode = 2;
}

export class ValidationError extends SolcliError {
  override readonly code = ERROR_CODES.INPUT_INVALID;
  override readonly exitCode = 2;
}

export class ConfigError extends SolcliError {
  override readonly code = ERROR_CODES.CONFIG;
  override readonly exitCode = 10;
}

export class SecretError extends SolcliError {
  override readonly code = ERROR_CODES.SECRET;
  override readonly exitCode = 11;
}

export class SignerError extends SolcliError {
  override readonly code = ERROR_CODES.NO_SIGNER;
  override readonly exitCode = 12;
}

export class RpcError extends SolcliError {
  override readonly code = ERROR_CODES.RPC;
  override readonly exitCode = 20;
}

export class RpcTimeoutError extends SolcliError {
  override readonly code = ERROR_CODES.RPC_TIMEOUT;
  override readonly exitCode = 20;
}

export class RpcRateLimitError extends SolcliError {
  override readonly code = ERROR_CODES.RPC_RATELIMIT;
  override readonly exitCode = 21;
}

export class BlockhashExpiredError extends SolcliError {
  override readonly code = ERROR_CODES.BLOCKHASH_EXPIRED;
  override readonly exitCode = 22;
}

export class InsufficientFundsError extends SolcliError {
  override readonly code = ERROR_CODES.INSUFFICIENT_FUNDS;
  override readonly exitCode = 23;
}

export class SimulationError extends SolcliError {
  override readonly code = ERROR_CODES.SIM_FAILED;
  override readonly exitCode = 24;
}

export class ProviderError extends SolcliError {
  override readonly code = ERROR_CODES.PROVIDER;
  override readonly exitCode = 30;
}

export class ProviderCapabilityUnsupportedError extends SolcliError {
  override readonly code = ERROR_CODES.PROVIDER_CAPABILITY_UNSUPPORTED;
  override readonly exitCode = 31;
}

export class NonInteractiveError extends SolcliError {
  override readonly code = ERROR_CODES.NO_INPUT;
  override readonly exitCode = 40;
}

export class ServiceUnavailableError extends SolcliError {
  override readonly code = ERROR_CODES.EX_UNAVAILABLE;
  override readonly exitCode = 69;
}

export class InternalError extends SolcliError {
  override readonly code = ERROR_CODES.INTERNAL;
  override readonly exitCode = 70;
}

export class IoError extends SolcliError {
  override readonly code = ERROR_CODES.IO;
  override readonly exitCode = 74;
}

// New foundation flow codes (ADR-0008 through ADR-0020).
export class SignerNotAvailableError extends SolcliError {
  override readonly code = ERROR_CODES.SIGNER_NOT_AVAILABLE;
  override readonly exitCode = 69;
}

export class SignerRefusedError extends SolcliError {
  override readonly code = ERROR_CODES.SIGNER_REFUSED;
  override readonly exitCode = 77;
}

export class SignerPermissionsInsecureError extends SolcliError {
  override readonly code = ERROR_CODES.SIGNER_PERMISSIONS_INSECURE;
  override readonly exitCode = 77;
}

export class SafetyBudgetExceededError extends SolcliError {
  override readonly code = ERROR_CODES.SAFETY_BUDGET_EXCEEDED;
  override readonly exitCode = 65;
}

export class SafetyIntentRequiredError extends SolcliError {
  override readonly code = ERROR_CODES.SAFETY_INTENT_REQUIRED;
  override readonly exitCode = 78;
}

export class SafetyProgramDeniedError extends SolcliError {
  override readonly code = ERROR_CODES.SAFETY_PROGRAM_DENIED;
  override readonly exitCode = 65;
}

export class TxBlockhashExpiredV2Error extends SolcliError {
  override readonly code = ERROR_CODES.TX_BLOCKHASH_EXPIRED;
  override readonly exitCode = 75;
}

export class TxSimulateFailedError extends SolcliError {
  override readonly code = ERROR_CODES.TX_SIMULATE_FAILED;
  override readonly exitCode = 65;
}

export class PluginInvalidManifestError extends SolcliError {
  override readonly code = ERROR_CODES.PLUGIN_INVALID_MANIFEST;
  override readonly exitCode = 65;
}

export class PluginIntegrityMismatchError extends SolcliError {
  override readonly code = ERROR_CODES.PLUGIN_INTEGRITY_MISMATCH;
  override readonly exitCode = 77;
}

export class PluginUnverifiedError extends SolcliError {
  override readonly code = ERROR_CODES.PLUGIN_UNVERIFIED;
  override readonly exitCode = 78;
}

export class IdlNotFoundError extends SolcliError {
  override readonly code = ERROR_CODES.IDL_NOT_FOUND;
  override readonly exitCode = 65;
}

export class McpTransportUnsupportedError extends SolcliError {
  override readonly code = ERROR_CODES.MCP_TRANSPORT_UNSUPPORTED;
  override readonly exitCode = 64;
}

export class EventSinkUnavailableError extends SolcliError {
  override readonly code = ERROR_CODES.EVENT_SINK_UNAVAILABLE;
  override readonly exitCode = 65;
}

export function toSolcliError(err: unknown): SolcliError {
  if (err instanceof SolcliError) return err;
  if (err instanceof Error) {
    return new InternalError(err.message, { cause: err });
  }
  return new InternalError(typeof err === "string" ? err : "Unknown error", {
    details: { raw: String(err) },
  });
}

// Last-resort handlers; the entrypoint's try/catch handles normal failures.
export function installGlobalErrorHandlers(): void {
  const handler = (err: unknown): never => {
    const wrapped = toSolcliError(err);
    const env = wrapped.toEnvelope();
    try {
      process.stderr.write(`${JSON.stringify({ schemaVersion: 1, error: env })}\n`);
    } catch {}
    process.exit(wrapped.exitCode);
  };
  process.on("uncaughtException", handler);
  process.on("unhandledRejection", handler);
}
