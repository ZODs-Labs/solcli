import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { envForDir, runCli } from "./helpers.js";

describe("config command lifecycle (AC8)", () => {
  it("set then get round-trips", async () => {
    const set = await runCli(["config", "set", "network", "devnet"]);
    expect(set.exitCode).toBe(0);
    const get = await runCli(["--output", "json", "config", "get", "network"], envForDir(set.dir));
    expect(get.exitCode).toBe(0);
    const parsed = JSON.parse(get.stdout.trim());
    expect(parsed.data.value).toBe("devnet");
  });

  it("config file lands in an env-paths-correct directory under the temp root", async () => {
    const set = await runCli(["config", "set", "network", "devnet"]);
    expect(set.exitCode).toBe(0);
    const found = await findFile(set.dir, "config.toml");
    expect(found).toBeTruthy();
  });

  it("config list shows the effective config", async () => {
    const set = await runCli(["config", "set", "network", "testnet"]);
    expect(set.exitCode).toBe(0);
    const out = await runCli(["--output", "json", "config", "list"], envForDir(set.dir));
    expect(out.exitCode).toBe(0);
    const parsed = JSON.parse(out.stdout.trim());
    expect(parsed.data.effective.network).toBe("testnet");
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
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) queue.push(p);
      else if (e.isFile() && e.name === name) {
        try {
          await access(p);
          return p;
        } catch {
          // ignore
        }
      }
    }
  }
  return null;
}
