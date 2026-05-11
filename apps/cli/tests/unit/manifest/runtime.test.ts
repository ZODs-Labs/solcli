import { describe, expect, it } from "vitest";
import type { CommandManifestEntry } from "../../../src/manifest/build.js";
import { loadManifestFromJson } from "../../../src/manifest/runtime.js";

function fixtureEntry(
  path: string,
  stability: "alpha" | "beta" | "stable",
  extra: Partial<CommandManifestEntry> = {},
): CommandManifestEntry {
  return {
    path,
    stability,
    tags: [],
    capabilities: [],
    input: { type: "object", properties: {} },
    output: { type: "object", properties: { schemaVersion: { const: 1 }, data: {} } },
    exitCodes: [0, 2],
    ...extra,
  };
}

function fixtureManifest(entries: readonly CommandManifestEntry[]): unknown {
  const commands: Record<string, CommandManifestEntry> = {};
  for (const e of entries) commands[e.path] = e;
  return {
    schemaVersion: 1,
    cliVersion: "0.0.1",
    commands,
  };
}

describe("loadManifestFromJson", () => {
  it("filters alpha entries by default", () => {
    const json = fixtureManifest([
      fixtureEntry("doctor", "beta"),
      fixtureEntry("experimental", "alpha"),
      fixtureEntry("settled", "stable"),
    ]);
    const out = loadManifestFromJson(json);
    expect(Object.keys(out.commands).sort()).toEqual(["doctor", "settled"]);
  });

  it("includes alpha entries when includeAlpha is true", () => {
    const json = fixtureManifest([
      fixtureEntry("doctor", "beta"),
      fixtureEntry("experimental", "alpha"),
    ]);
    const out = loadManifestFromJson(json, { includeAlpha: true });
    expect(Object.keys(out.commands).sort()).toEqual(["doctor", "experimental"]);
  });

  it("merges plugin overlay entries and preserves contributedBy", () => {
    const json = fixtureManifest([fixtureEntry("doctor", "beta")]);
    const overlay: readonly CommandManifestEntry[] = [
      fixtureEntry("plugin.example", "beta", { contributedBy: "example-plugin" }),
    ];
    const out = loadManifestFromJson(json, { pluginOverlay: overlay });
    expect(Object.keys(out.commands).sort()).toEqual(["doctor", "plugin.example"]);
    expect(out.commands["plugin.example"]?.contributedBy).toBe("example-plugin");
  });

  it("filters alpha overlay entries unless includeAlpha is true", () => {
    const json = fixtureManifest([]);
    const overlay: readonly CommandManifestEntry[] = [
      fixtureEntry("plugin.alpha", "alpha", { contributedBy: "p" }),
      fixtureEntry("plugin.beta", "beta", { contributedBy: "p" }),
    ];
    const filtered = loadManifestFromJson(json, { pluginOverlay: overlay });
    expect(Object.keys(filtered.commands)).toEqual(["plugin.beta"]);

    const all = loadManifestFromJson(json, { pluginOverlay: overlay, includeAlpha: true });
    expect(Object.keys(all.commands).sort()).toEqual(["plugin.alpha", "plugin.beta"]);
  });

  it("rejects payloads with the wrong schemaVersion", () => {
    expect(() => loadManifestFromJson({ schemaVersion: 2, cliVersion: "x", commands: {} })).toThrow(
      /schemaVersion/,
    );
  });

  it("rejects payloads that are not objects", () => {
    expect(() => loadManifestFromJson(null)).toThrow(/not an object/);
  });

  it("returns commands sorted by path", () => {
    const json = fixtureManifest([
      fixtureEntry("zeta", "beta"),
      fixtureEntry("alpha-cmd", "beta"),
      fixtureEntry("mu", "beta"),
    ]);
    const out = loadManifestFromJson(json);
    expect(Object.keys(out.commands)).toEqual(["alpha-cmd", "mu", "zeta"]);
  });
});
