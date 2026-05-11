import type { PortMap, PortName, ProviderInstance, ProviderManifest } from "@solcli/contracts";
import { InternalError } from "@solcli/errors";

export type PortBindings = { readonly [K in PortName]?: PortMap[K] };

export function defineManifest(name: string, version: string, ports: PortName[]): ProviderManifest {
  return Object.freeze({
    name,
    version,
    ports: new Set(ports),
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
