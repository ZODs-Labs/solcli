import type { ProviderInstance, ProviderManifest } from "@solcli/contracts";
import { defineManifest, makeProviderInstance } from "../../manifest.js";

export const TRITON_MANIFEST: ProviderManifest = defineManifest("triton", "1", []);

export interface CreateTritonProviderOptions {
  readonly apiKey?: string;
  readonly bearer?: string;
  readonly endpoint?: string;
}

export function createTritonProvider(_opts?: CreateTritonProviderOptions): ProviderInstance {
  return makeProviderInstance(TRITON_MANIFEST, {});
}
