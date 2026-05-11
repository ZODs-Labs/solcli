import type { PluginManifest } from "@solcli/contracts";

/**
 * Shape of a contributed command overlay. The IDL synthesizer and the runtime
 * command dispatcher both consume this; the runtime command dispatcher merges
 * overlays into the synthesized command tree after the static manifest is
 * generated, and the IDL synthesizer reads it to attach the `tier=2` or
 * `tier=3` flag for stability reporting.
 */
export interface CommandManifestEntry {
  readonly command: string;
  readonly stability: "alpha" | "beta" | "stable";
  readonly tier: 1 | 2 | 3;
  readonly synthesized: boolean;
  readonly description?: string;
}

export interface CommandManifestOverlay {
  readonly commandPath: string;
  readonly entry: CommandManifestEntry;
  readonly contributedBy: string;
}

export interface PluginContribution {
  readonly manifest: PluginManifest;
  readonly overlays: readonly CommandManifestOverlay[];
}

export interface PluginRegistry {
  addContribution(
    name: string,
    manifest: PluginManifest,
    overlays: readonly CommandManifestOverlay[],
  ): void;
  removeContribution(name: string): void;
  listContributions(): readonly {
    readonly name: string;
    readonly contribution: PluginContribution;
  }[];
  listManifestOverlays(): readonly CommandManifestOverlay[];
  has(name: string): boolean;
  clear(): void;
}

export function createPluginRegistry(): PluginRegistry {
  const contributions = new Map<string, PluginContribution>();

  return {
    addContribution(name, manifest, overlays) {
      contributions.set(name, { manifest, overlays });
    },
    removeContribution(name) {
      contributions.delete(name);
    },
    listContributions() {
      const out: { name: string; contribution: PluginContribution }[] = [];
      for (const [name, contribution] of contributions) {
        out.push({ name, contribution });
      }
      return out;
    },
    listManifestOverlays() {
      const out: CommandManifestOverlay[] = [];
      for (const contribution of contributions.values()) {
        for (const overlay of contribution.overlays) {
          out.push(overlay);
        }
      }
      return out;
    },
    has(name) {
      return contributions.has(name);
    },
    clear() {
      contributions.clear();
    },
  };
}
