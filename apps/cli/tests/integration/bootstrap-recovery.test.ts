import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { envForDir, runCli } from "./helpers.js";

/**
 * Regression: `config set` and `secrets set` must work even when the on-disk
 * config references a provider whose secret is missing. Without this, the
 * very commands that exist to fix a broken bootstrap fail to run.
 *
 * The original bug: every command went through `buildContext` →
 * `registerConfiguredProviders`, which threw on misconfigured providers,
 * so the user couldn't `config set` or `secrets set` their way out.
 */
describe("bootstrap recovery: broken provider config does not break config/secrets/doctor", () => {
  it("config set succeeds when a referenced provider has a missing secret", async () => {
    // Seed a tmp HOME with a valid config so we know where solcli plants its file.
    const seed = await runCli(["config", "set", "network", "mainnet-beta"]);
    expect(seed.exitCode).toBe(0);
    const configFile = await findFile(seed.dir, "config.toml");
    expect(configFile).toBeTruthy();

    // Now overwrite that file with a broken state: active=helius, no helius block.
    await writeFile(
      configFile as string,
      `default_profile = "default"

[default]
network = "mainnet-beta"

[default.provider]
active = "helius"
`,
      "utf8",
    );

    // The original bug: this would fail with SOLCLI_E_CONFIG before the
    // bootstrap fix. With lazy registration, config set succeeds.
    const out = await runCli(
      ["--output", "json", "config", "set", "provider.helius.apiKeySecret", "helius-api-key"],
      envForDir(seed.dir),
    );
    expect(out.exitCode).toBe(0);
    const updated = await readFile(configFile as string, "utf8");
    expect(updated).toContain('apiKeySecret = "helius-api-key"');
  });

  it("doctor surfaces provider registration failures as warnings, not errors", async () => {
    const seed = await runCli(["config", "set", "network", "mainnet-beta"]);
    expect(seed.exitCode).toBe(0);
    const configFile = await findFile(seed.dir, "config.toml");
    expect(configFile).toBeTruthy();

    await writeFile(
      configFile as string,
      `default_profile = "default"

[default]
network = "mainnet-beta"

[default.provider]
active = "helius"

[default.provider.helius]
apiKeySecret = "missing-secret"
`,
      "utf8",
    );

    const out = await runCli(["--output", "json", "doctor"], envForDir(seed.dir));
    expect(out.exitCode).toBe(0);
    const parsed = JSON.parse(out.stdout.trim());
    const providers = parsed.data.checks.find((c: { name: string }) => c.name === "providers");
    expect(providers.status).toBe("warn");
    expect(providers.data.errors).toBeDefined();
    expect(providers.data.errors[0].provider).toBe("helius");
    expect(providers.data.errors[0].code).toBe("SOLCLI_E_CONFIG");
  });

  it("secrets set works even when the active provider points at a missing secret", async () => {
    const seed = await runCli(["config", "set", "network", "mainnet-beta"]);
    expect(seed.exitCode).toBe(0);
    const configFile = await findFile(seed.dir, "config.toml");
    expect(configFile).toBeTruthy();

    await writeFile(
      configFile as string,
      `default_profile = "default"

[default]
network = "mainnet-beta"

[default.provider]
active = "helius"

[default.provider.helius]
apiKeySecret = "helius-api-key"
`,
      "utf8",
    );

    const out = await runCli(
      ["--output", "json", "secrets", "set", "helius-api-key", "--value", "fake-key-for-test"],
      envForDir(seed.dir),
    );
    expect(out.exitCode).toBe(0);
  });
});

async function findFile(root: string, name: string): Promise<string | null> {
  const queue: string[] = [root];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.name === name) return full;
    }
  }
  return null;
}
