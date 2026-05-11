import type { ProviderInstance, ProviderManifest } from "@solcli/contracts";
import { defineManifest, makeProviderInstance } from "../../manifest.js";

export const HELIUS_MANIFEST: ProviderManifest = defineManifest("helius", "1", []);

export interface CreateHeliusProviderOptions {
  readonly apiKey?: string;
  readonly endpoint?: string;
}

export function createHeliusProvider(_opts?: CreateHeliusProviderOptions): ProviderInstance {
  return makeProviderInstance(HELIUS_MANIFEST, {});
}
