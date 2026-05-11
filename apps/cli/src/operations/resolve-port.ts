import type { PortMap, PortName, ProviderInstance, ProviderRegistry } from "@solcli/contracts";
import { ProviderCapabilityUnsupportedError, UsageError } from "@solcli/errors";

export interface ResolvedPort<K extends PortName> {
  readonly port: PortMap[K];
  readonly provider: ProviderInstance;
}

export function resolvePort<K extends PortName>(
  registry: ProviderRegistry,
  name: K,
  override?: string,
): ResolvedPort<K> {
  return resolvePortCandidates(registry, name, override)[0] as ResolvedPort<K>;
}

export function resolvePortCandidates<K extends PortName>(
  registry: ProviderRegistry,
  name: K,
  override?: string,
): readonly ResolvedPort<K>[] {
  if (override) {
    const explicit = registry.byName(override);
    if (!explicit) {
      throw new UsageError(`Unknown provider: ${override}`, {
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
    return [{ port, provider: explicit }];
  }

  const candidates = registry.capableFor(name);
  if (candidates.length === 0) {
    throw new ProviderCapabilityUnsupportedError(`No registered provider supports '${name}'`, {
      details: {
        port: name,
        available: registry.list().map((p) => p.manifest.name),
      },
    });
  }
  const resolved: ResolvedPort<K>[] = [];
  for (const provider of candidates) {
    const port = provider.port<K>(name);
    if (!port) {
      throw new ProviderCapabilityUnsupportedError(
        `Provider '${provider.manifest.name}' advertised '${name}' but exposes no binding`,
        { details: { provider: provider.manifest.name, port: name } },
      );
    }
    resolved.push({ port, provider });
  }
  return resolved;
}
