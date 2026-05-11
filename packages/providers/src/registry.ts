import type { PortName, ProviderInstance, ProviderRegistry } from "@solcli/contracts";
import { ProviderError } from "@solcli/errors";

export interface CreateProviderRegistryOptions {
  readonly active?: string;
  readonly providers?: readonly ProviderInstance[];
  readonly fallbackOrder?: readonly string[];
}

export class InMemoryProviderRegistry implements ProviderRegistry {
  private readonly providers = new Map<string, ProviderInstance>();
  private activeName: string | undefined;
  private fallback: readonly string[];

  constructor(opts: CreateProviderRegistryOptions = {}) {
    for (const p of opts.providers ?? []) this.providers.set(p.manifest.name, p);
    this.activeName = opts.active;
    this.fallback = opts.fallbackOrder ?? [];
  }

  register(provider: ProviderInstance): void {
    this.providers.set(provider.manifest.name, provider);
  }

  active(): ProviderInstance | undefined {
    if (!this.activeName) return undefined;
    return this.providers.get(this.activeName);
  }

  byName(name: string): ProviderInstance | undefined {
    return this.providers.get(name);
  }

  capableFor(name: PortName): readonly ProviderInstance[] {
    const order: string[] = [];
    if (this.activeName) order.push(this.activeName);
    for (const n of this.fallback) if (!order.includes(n)) order.push(n);
    for (const n of this.providers.keys()) if (!order.includes(n)) order.push(n);

    const out: ProviderInstance[] = [];
    for (const n of order) {
      const p = this.providers.get(n);
      if (p?.manifest.ports.has(name)) out.push(p);
    }
    return out;
  }

  list(): readonly ProviderInstance[] {
    return [...this.providers.values()];
  }

  setActive(name: string): void {
    if (!this.providers.has(name)) {
      throw new ProviderError(`Unknown provider: ${name}`, {
        details: { available: [...this.providers.keys()] },
      });
    }
    this.activeName = name;
  }

  fallbackOrder(): readonly string[] {
    return this.fallback;
  }

  setFallbackOrder(names: readonly string[]): void {
    this.fallback = [...names];
  }
}

export function createProviderRegistry(opts: CreateProviderRegistryOptions = {}): ProviderRegistry {
  return new InMemoryProviderRegistry(opts);
}
