import type { Logger, ProviderRegistry } from "@solcli/contracts";

export interface OperationDeps {
  readonly registry: ProviderRegistry;
  readonly logger: Logger;
}

export interface OperationInvokeOptions {
  readonly signal?: AbortSignal;
  readonly provider?: string;
}
