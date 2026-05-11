import type { PortMap, PortName, ProviderInstance, ProviderRegistry } from "@solcli/contracts";
import { ProviderCapabilityUnsupportedError, ProviderError } from "@solcli/errors";

export interface ResolvedPort<K extends PortName> {
  readonly port: PortMap[K];
  readonly provider: ProviderInstance;
}

export function resolvePort<K extends PortName>(
  registry: ProviderRegistry,
  name: K,
  override?: string,
): ResolvedPort<K> {
  if (override) {
    const explicit = registry.byName(override);
    if (!explicit) {
      throw new ProviderError(`Unknown provider: ${override}`, {
        details: { available: registry.list().map((p) => p.manifest.name) },
      });
    }
    const port = explicit.port<K>(name);
    if (!port) {
      throw new ProviderCapabilityUnsupportedError(
        `Provider '${override}' does not support '${name}'`,
        { details: { provider: override, port: name } },
      );
    }
    return { port, provider: explicit };
  }

  const candidates = registry.capableFor(name);
  const first = candidates[0];
  if (!first) {
    throw new ProviderCapabilityUnsupportedError(`No registered provider supports '${name}'`, {
      details: {
        port: name,
        available: registry.list().map((p) => p.manifest.name),
      },
    });
  }
  const port = first.port<K>(name);
  if (!port) {
    throw new ProviderCapabilityUnsupportedError(
      `Provider '${first.manifest.name}' advertised '${name}' but exposes no binding`,
      { details: { provider: first.manifest.name, port: name } },
    );
  }
  return { port, provider: first };
}
