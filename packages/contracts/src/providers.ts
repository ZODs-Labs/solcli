import type { PortMap, PortName } from "./ports/index.js";

export type { PortName } from "./ports/index.js";

export interface ProviderManifest {
  readonly name: string;
  readonly version: string;
  readonly ports: ReadonlySet<PortName>;
}

export interface ProviderInstance {
  readonly manifest: ProviderManifest;
  port<K extends PortName>(name: K): PortMap[K] | undefined;
}

export interface ProviderRegistry {
  register(provider: ProviderInstance): void;
  active(): ProviderInstance | undefined;
  byName(name: string): ProviderInstance | undefined;
  capableFor(name: PortName): readonly ProviderInstance[];
  list(): readonly ProviderInstance[];
  setActive(name: string): void;
  fallbackOrder(): readonly string[];
  setFallbackOrder(names: readonly string[]): void;
}
