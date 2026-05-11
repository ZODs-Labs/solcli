import type { PortMap, PortName, ProviderInstance, ProviderManifest } from "@solcli/contracts";
import { InternalError } from "@solcli/errors";

export type PortBindings = { readonly [K in PortName]?: PortMap[K] };

export function defineManifest(name: string, version: string, ports: PortName[]): ProviderManifest {
  return Object.freeze({
    name,
    version,
    ports: Object.freeze(new FrozenReadonlySet(ports)),
  });
}

export function makeProviderInstance(
  manifest: ProviderManifest,
  bindings: PortBindings,
): ProviderInstance {
  for (const portName of manifest.ports) {
    if (bindings[portName] === undefined) {
      throw new InternalError(
        `provider '${manifest.name}': manifest declares port '${portName}' but no binding was registered`,
      );
    }
  }
  for (const key of Object.keys(bindings) as PortName[]) {
    if (!manifest.ports.has(key)) {
      throw new InternalError(
        `provider '${manifest.name}': binding for port '${key}' is not declared in the manifest`,
      );
    }
  }
  return {
    manifest,
    port<K extends PortName>(name: K): PortMap[K] | undefined {
      return bindings[name];
    },
  };
}

class FrozenReadonlySet<T> implements ReadonlySet<T> {
  readonly #inner: Set<T>;

  constructor(values: Iterable<T>) {
    this.#inner = new Set(values);
  }

  get size(): number {
    return this.#inner.size;
  }

  get [Symbol.toStringTag](): string {
    return "Set";
  }

  has(value: T): boolean {
    return this.#inner.has(value);
  }

  forEach(callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: unknown): void {
    for (const value of this.#inner) {
      callbackfn.call(thisArg, value, value, this);
    }
  }

  entries(): SetIterator<[T, T]> {
    return this.#inner.entries();
  }

  keys(): SetIterator<T> {
    return this.#inner.keys();
  }

  values(): SetIterator<T> {
    return this.#inner.values();
  }

  [Symbol.iterator](): SetIterator<T> {
    return this.#inner[Symbol.iterator]();
  }
}
