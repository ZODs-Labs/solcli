import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { envForDir, runCli } from "./helpers.js";

describe("secrets command lifecycle (AC7, AC12)", () => {
  it("set / get / list / rm round-trip", async () => {
    const set = await runCli([
      "secrets",
      "set",
      "helius.apiKey",
      "--value",
      "SECRET-API-KEY-12345",
    ]);
    expect(set.exitCode).toBe(0);

    const setJson = await runCli(
      ["--output", "json", "secrets", "set", "stripe.apiKey", "--value", "OTHER-SECRET-67890"],
      envForDir(set.dir),
    );
    expect(setJson.exitCode).toBe(0);

    const list = await runCli(["--output", "json", "secrets", "list"], envForDir(set.dir));
    expect(list.exitCode).toBe(0);
    const listData = JSON.parse(list.stdout.trim());
    expect((listData.data.names as string[]).sort()).toEqual(
      ["helius.apiKey", "stripe.apiKey"].sort(),
    );

    const get = await runCli(
      ["--output", "json", "secrets", "get", "helius.apiKey", "--reveal", "--yes"],
      envForDir(set.dir),
    );
    expect(get.exitCode).toBe(0);
    const getData = JSON.parse(get.stdout.trim());
    expect(getData.data.value).toBe("SECRET-API-KEY-12345");

    const rm = await runCli(
      ["--output", "json", "secrets", "rm", "helius.apiKey", "--yes"],
      envForDir(set.dir),
    );
    expect(rm.exitCode).toBe(0);
  }, 30_000);

  it("AC12 - logs never contain the plaintext secret", async () => {
    const set = await runCli([
      "secrets",
      "set",
      "tested.apiKey",
      "--value",
      "LEAK-CHECK-VALUE-987",
    ]);
    expect(set.exitCode).toBe(0);
    const logs = await findFiles(set.dir, /\.log$/);
    let leak = false;
    for (const f of logs) {
      const raw = await readFile(f, "utf8");
      if (raw.includes("LEAK-CHECK-VALUE-987")) {
        leak = true;
        break;
      }
    }
    expect(leak).toBe(false);
  });
});

async function findFiles(root: string, pattern: RegExp): Promise<string[]> {
  const out: string[] = [];
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
      else if (e.isFile() && pattern.test(e.name)) out.push(p);
    }
  }
  return out;
}
