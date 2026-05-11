#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures: string[] = [];

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, file), "utf8")) as Record<string, unknown>;
}

function checkCatalogDeps(file: string, pkg: Record<string, unknown>): void {
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const deps = pkg[section] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (name.startsWith("@solcli/")) {
        if (spec !== "workspace:*") failures.push(`${file}: ${name} must use workspace:*`);
        continue;
      }
      if (spec !== "catalog:") {
        failures.push(`${file}: ${section}.${name} must use catalog:, found ${spec}`);
      }
    }
  }
}

const rootPkg = await readJson("package.json");
if (rootPkg.private !== true) failures.push("package.json: root package must be private");
checkCatalogDeps("package.json", rootPkg);

for (const dir of [
  "apps/cli",
  "packages/cache",
  "packages/config",
  "packages/contracts",
  "packages/errors",
  "packages/logger",
  "packages/output",
  "packages/platform",
  "packages/prompts",
  "packages/providers",
  "packages/secrets",
  "packages/solana-stubs",
  "packages/utils",
]) {
  const pkg = await readJson(`${dir}/package.json`);
  checkCatalogDeps(`${dir}/package.json`, pkg);
}

if (failures.length > 0) {
  console.error(`verify-deps failed with ${failures.length} violation(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify-deps: ok");
