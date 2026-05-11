import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  discoverPathPlugins,
  executePathPlugin,
  type FsAdapter,
} from "../../../src/extensions/path-discovery.js";

interface PosixFixture {
  pathDir: string;
  fooBinary: string;
}

async function makePosixFixture(): Promise<PosixFixture> {
  const dir = await mkdtemp(path.join(tmpdir(), "solcli-pathdisc-"));
  const fooBinary = path.join(dir, "solcli-foo");
  await writeFile(fooBinary, "#!/usr/bin/env node\nprocess.stdout.write('hello-foo');\n", {
    mode: 0o755,
  });
  await chmod(fooBinary, 0o755);
  // a non-matching file
  await writeFile(path.join(dir, "not-a-plugin"), "noop", { mode: 0o755 });
  await chmod(path.join(dir, "not-a-plugin"), 0o755);
  // a matching name but no exec bits
  const nonexec = path.join(dir, "solcli-quiet");
  await writeFile(nonexec, "noop", { mode: 0o644 });
  await chmod(nonexec, 0o644);
  return { pathDir: dir, fooBinary };
}

describe("path-discovery", () => {
  describe("on POSIX-like platforms", () => {
    let fx: PosixFixture;
    beforeAll(async () => {
      fx = await makePosixFixture();
    });

    it("finds solcli-foo and ignores non-matching or non-executable files", async () => {
      const found = await discoverPathPlugins({
        env: { PATH: fx.pathDir },
        platform: "linux",
      });
      const names = found.map((p) => p.name);
      expect(names).toContain("foo");
      expect(names).not.toContain("quiet");
      expect(names).not.toContain("not-a-plugin");
    });

    it("deduplicates duplicate PATH entries", async () => {
      const found = await discoverPathPlugins({
        env: { PATH: `${fx.pathDir}:${fx.pathDir}` },
        platform: "linux",
      });
      const fooEntries = found.filter((p) => p.name === "foo");
      expect(fooEntries).toHaveLength(1);
    });
  });

  describe("on Windows", () => {
    it("honors PATHEXT and matches .CMD / .BAT", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "solcli-pathdisc-win-"));
      const cmdPath = path.join(dir, "solcli-bar.CMD");
      await writeFile(cmdPath, "@echo hi");
      const found = await discoverPathPlugins({
        env: { PATH: dir, PATHEXT: ".COM;.EXE;.CMD" },
        platform: "win32",
      });
      const names = found.map((p) => p.name);
      expect(names).toContain("bar");
    });
  });

  describe("FS adapter override", () => {
    it("returns nothing when the adapter reports an empty dir", async () => {
      const fs: FsAdapter = {
        readdir: async () => [],
        stat: async () => ({ isFile: false, mode: 0 }),
      };
      const found = await discoverPathPlugins({ env: { PATH: "/nowhere" }, platform: "linux", fs });
      expect(found).toEqual([]);
    });
  });

  describe("executePathPlugin", () => {
    it("uses execFile (array args, no shell) and propagates exit code + stdout", async () => {
      const fx = await makePosixFixture();
      const node = process.execPath;
      const argScript = path.join(fx.pathDir, "echo-args.cjs");
      await writeFile(
        argScript,
        "process.stdout.write(JSON.stringify({argv: process.argv.slice(2)}));\n",
      );
      const controller = new AbortController();
      const result = await executePathPlugin(
        node,
        [argScript, "alpha", "$(echo injected)", "--flag=on"],
        {
          signal: controller.signal,
          timeoutMs: 5_000,
          maxBuffer: 64 * 1024,
        },
      );
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as { argv: string[] };
      // Critical: the shell-substitution literal must reach the child verbatim.
      // If a shell ran, `$(echo injected)` would have been expanded. The
      // script's `process.argv.slice(2)` drops node + script path, leaving
      // only the user-passed args.
      expect(parsed.argv).toEqual(["alpha", "$(echo injected)", "--flag=on"]);
    });

    it("aborts a long-running child when the signal fires", async () => {
      const node = process.execPath;
      const controller = new AbortController();
      const promise = executePathPlugin(node, ["-e", "setInterval(()=>{},1000);"], {
        signal: controller.signal,
        timeoutMs: 10_000,
        maxBuffer: 64 * 1024,
      });
      setTimeout(() => controller.abort(), 50);
      await expect(promise).rejects.toBeDefined();
    });
  });

  afterAll(() => {
    // temp dirs cleaned by the OS
  });
});
