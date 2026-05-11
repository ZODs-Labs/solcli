#!/usr/bin/env tsx
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { execa } from "execa";

const root = process.cwd();
const tmp = await mkdtemp(path.join(tmpdir(), "solcli-pack-"));

await execa("pnpm", ["--filter", "solcli", "pack", "--pack-destination", tmp], {
  cwd: root,
  stdio: "inherit",
});

const tarballs = (await readdir(tmp)).filter((name) => name.endsWith(".tgz"));
if (tarballs.length !== 1) throw new Error(`Expected one tarball, found ${tarballs.length}`);
const tarball = path.join(tmp, tarballs[0] as string);
const { stdout } = await execa("tar", ["-tf", tarball]);
const entries = stdout.split("\n").filter(Boolean);

for (const forbidden of ["apps/cli/src/", "packages/", "tests/"]) {
  if (entries.some((entry) => entry.includes(forbidden))) {
    throw new Error(`Packed tarball contains forbidden path: ${forbidden}`);
  }
}

const installDir = path.join(tmp, "install");
await mkdir(installDir, { recursive: true });
await writeFile(path.join(installDir, "package.json"), '{"private":true,"type":"module"}\n');
await execa("pnpm", ["add", tarball], { cwd: installDir });
const packageJson = JSON.parse(await readFile(path.join(installDir, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};
if (!packageJson.dependencies?.solcli) {
  throw new Error("Smoke project did not install solcli");
}

await execa("pnpm", ["exec", "solcli", "--help"], {
  cwd: installDir,
  env: { NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" },
});

console.log("package-smoke: ok");
