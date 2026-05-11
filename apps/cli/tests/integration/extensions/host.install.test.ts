import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger, Paths } from "@solcli/contracts";
import { ERROR_CODES, PluginUnverifiedError } from "@solcli/errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bootstrapExtensionHost,
  createDefaultPluginConfigStore,
  createExtensionHost,
  defaultExtractTarball,
} from "../../../src/extensions/host.js";
import { computeSha384 } from "../../../src/extensions/integrity.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_TGZ = path.resolve(HERE, "../../fixtures/plugins/demo-plugin.tgz");

interface TestEnv {
  paths: Paths;
  tarball: Uint8Array;
  cleanup(): Promise<void>;
}

async function makeEnv(): Promise<TestEnv> {
  const root = await mkdtemp(path.join(tmpdir(), "solcli-host-it-"));
  const tarball = new Uint8Array(await readFile(FIXTURE_TGZ));
  const paths: Paths = {
    config: path.join(root, "config"),
    data: path.join(root, "data"),
    cache: path.join(root, "cache"),
    log: path.join(root, "log"),
    temp: path.join(root, "temp"),
  };
  return {
    paths,
    tarball,
    async cleanup() {
      // The OS temp dir is fine to leave; CI runners clean it.
    },
  };
}

function silentLogger(): Logger {
  const noop = (): void => {};
  const stub: Logger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => stub,
    flush: async () => {},
  };
  return stub;
}

describe("ExtensionHost.install", () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await makeEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it("installs a fixture tarball, records the integrity hash and updates the registry atomically", async () => {
    const host = bootstrapExtensionHost({
      paths: env.paths,
      logger: silentLogger(),
      fetchOverride: async () => env.tarball,
    });
    const controller = new AbortController();
    const result = await host.install({
      id: "@solcli-fixture/demo",
      version: "0.1.0",
      fromPath: FIXTURE_TGZ,
      trust: "community",
      interactive: false,
      signal: controller.signal,
    });
    expect(result.manifest.name).toBe("@solcli-fixture/demo");
    expect(result.integrity).toBe(computeSha384(env.tarball));
    expect(result.integrity.startsWith("sha384-")).toBe(true);
    // Plugin directory was created.
    const installed = await stat(result.pluginDir);
    expect(installed.isDirectory()).toBe(true);
    const entries = await readdir(result.pluginDir);
    expect(entries).toContain("solcli.plugin.json");
    // Atomic registry update: no leftover .tmp file, registry json is parseable.
    const registryPath = path.join(env.paths.config, "plugins.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      plugins: { id: string; integrity: string }[];
    };
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]?.id).toBe("@solcli-fixture/demo");
    expect(registry.plugins[0]?.integrity).toBe(result.integrity);
    const configDirEntries = await readdir(env.paths.config);
    for (const name of configDirEntries) {
      expect(name.endsWith(".tmp")).toBe(false);
    }
  });

  it("rejects an installation when the tarball hash does not match the pinned integrity", async () => {
    const host = bootstrapExtensionHost({
      paths: env.paths,
      logger: silentLogger(),
      fetchOverride: async () => env.tarball,
    });
    const controller = new AbortController();
    const wrong = `sha384-${"A".repeat(64)}=`;
    await expect(
      host.install({
        id: "@solcli-fixture/demo",
        version: "0.1.0",
        fromPath: FIXTURE_TGZ,
        trust: "community",
        expectedIntegrity: wrong,
        interactive: false,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PLUGIN_INTEGRITY_MISMATCH });
  });

  it("refuses a signer:always plugin in non-interactive mode without --yes-permissions=signer", async () => {
    // Build a manifest with signer=always inside a synthetic staging dir; rather
    // than re-tarring on the fly we reuse defaultExtractTarball to ensure the
    // tarball extracts then patches the manifest in-place at the staging step
    // via an extract override that writes the desired manifest.
    const host = createExtensionHost({
      paths: env.paths,
      logger: silentLogger(),
      config: createDefaultPluginConfigStore(env.paths),
      fetchTarball: async () => env.tarball,
      extractTarball: async (args) => {
        await defaultExtractTarball(args);
        const manifestPath = path.join(args.destDir, "solcli.plugin.json");
        const raw = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
        (raw as { permissions: Record<string, unknown> }).permissions = {
          ports: ["signTransaction"],
          network: ["devnet"],
          signer: "always",
        };
        await writeFile(manifestPath, `${JSON.stringify(raw, null, 2)}\n`);
      },
    });
    const controller = new AbortController();
    await expect(
      host.install({
        id: "@solcli-fixture/demo",
        version: "0.1.0",
        fromPath: FIXTURE_TGZ,
        trust: "community",
        interactive: false,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(PluginUnverifiedError);
  });

  it("AC4: contributed commands surface via listManifestOverlays after install", async () => {
    const host = bootstrapExtensionHost({
      paths: env.paths,
      logger: silentLogger(),
      fetchOverride: async () => env.tarball,
    });
    const controller = new AbortController();
    await host.install({
      id: "@solcli-fixture/demo",
      version: "0.1.0",
      fromPath: FIXTURE_TGZ,
      trust: "community",
      interactive: false,
      signal: controller.signal,
    });
    const overlays = host.listManifestOverlays();
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.commandPath).toBe("demo.hello");
    expect(overlays[0]?.contributedBy).toBe("@solcli-fixture/demo");
    expect(overlays[0]?.entry.tier).toBe(2);
    expect(overlays[0]?.entry.stability).toBe("alpha");
    expect(overlays[0]?.entry.synthesized).toBe(false);
  });

  it("admits a signer:always plugin in non-interactive mode when --yes-permissions=signer is passed", async () => {
    const host = createExtensionHost({
      paths: env.paths,
      logger: silentLogger(),
      config: createDefaultPluginConfigStore(env.paths),
      fetchTarball: async () => env.tarball,
      extractTarball: async (args) => {
        await defaultExtractTarball(args);
        const manifestPath = path.join(args.destDir, "solcli.plugin.json");
        const raw = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
        (raw as { permissions: Record<string, unknown> }).permissions = {
          ports: ["signTransaction"],
          network: ["devnet"],
          signer: "always",
        };
        await writeFile(manifestPath, `${JSON.stringify(raw, null, 2)}\n`);
      },
    });
    const controller = new AbortController();
    const result = await host.install({
      id: "@solcli-fixture/demo",
      version: "0.1.0",
      fromPath: FIXTURE_TGZ,
      trust: "community",
      interactive: false,
      yesPermissions: ["signer"],
      signal: controller.signal,
    });
    expect(result.manifest.permissions.signer).toBe("always");
  });
});
