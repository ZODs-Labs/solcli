import type { PluginManifest, TrustTier } from "../domain/plugin-manifest.js";

export interface PluginLoadOptions {
  readonly signal: AbortSignal;
  readonly trustOverride?: TrustTier;
}

export interface LoadedPlugin {
  readonly manifest: PluginManifest;
  readonly module: unknown;
}

export interface PluginLoadPort {
  load(spec: string, opts: PluginLoadOptions): Promise<LoadedPlugin>;
}
