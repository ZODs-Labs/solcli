#!/usr/bin/env tsx
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceExt = /\.(?:ts|tsx|js|mjs|cjs)$/;

async function walk(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (sourceExt.test(entry.name)) out.push(full);
  }
  return out;
}

function importsOf(source: string): string[] {
  const imports: string[] = [];
  const re =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\(["']([^"']+)["']\)/g;
  for (const match of source.matchAll(re)) {
    const spec = match[1] ?? match[2];
    if (spec) imports.push(spec);
  }
  return imports;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

const failures: string[] = [];

function fail(file: string, message: string): void {
  failures.push(`${path.relative(root, file)}: ${message}`);
}

const packageFiles = await walk(path.join(root, "packages"));
for (const file of packageFiles) {
  const text = await readFile(file, "utf8");
  for (const spec of importsOf(text)) {
    if (spec.includes("apps/cli") || spec.includes("/commands/")) {
      fail(file, `package code imports CLI/commands via ${spec}`);
    }
    if (file.includes(`${path.sep}packages${path.sep}`) && spec.startsWith("../")) {
      const resolved = path.resolve(path.dirname(file), spec);
      if (resolved.includes(`${path.sep}packages${path.sep}`)) {
        const currentPackage = file.split(`${path.sep}packages${path.sep}`)[1]?.split(path.sep)[0];
        const targetPackage = resolved
          .split(`${path.sep}packages${path.sep}`)[1]
          ?.split(path.sep)[0];
        if (currentPackage && targetPackage && currentPackage !== targetPackage) {
          fail(file, `cross-package relative import ${spec}; use @solcli/${targetPackage}`);
        }
      }
    }
    // Vendors under packages/providers/src/vendors/<vendor>/** are isolated:
    // one vendor folder may not import another vendor folder. Shared adapter
    // infrastructure lives in packages/providers/src/_base/**.
    const vendorsRoot = path.join("packages", "providers", "src", "vendors");
    if (file.includes(`${path.sep}${vendorsRoot}${path.sep}`)) {
      const sourceVendor = file
        .split(`${path.sep}${vendorsRoot}${path.sep}`)[1]
        ?.split(path.sep)[0];
      if (sourceVendor && spec.startsWith("../")) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (resolved.includes(`${path.sep}${vendorsRoot}${path.sep}`)) {
          const targetVendor = resolved
            .split(`${path.sep}${vendorsRoot}${path.sep}`)[1]
            ?.split(path.sep)[0];
          if (targetVendor && sourceVendor !== targetVendor) {
            fail(
              file,
              `vendor '${sourceVendor}' imports vendor '${targetVendor}'; share via packages/providers/src/_base/ instead`,
            );
          }
        }
      }
    }
  }
}

const commandFiles = await walk(path.join(root, "apps", "cli", "src", "commands"));
for (const file of commandFiles) {
  const text = await readFile(file, "utf8");
  for (const spec of importsOf(text)) {
    if (
      spec.startsWith("@solcli/") &&
      !spec.startsWith("@solcli/contracts") &&
      !spec.startsWith("@solcli/platform") &&
      !spec.startsWith("@solcli/protocol-")
    ) {
      fail(file, `command imports concrete package ${spec}`);
    }
  }
}

const contractFiles = await walk(path.join(root, "packages", "contracts", "src"));
for (const file of contractFiles) {
  const text = await readFile(file, "utf8");
  if (/^\s*(?:export\s+)?const\s+/m.test(text)) {
    fail(file, "contracts package contains a runtime const");
  }
  if (/^\s*import\s+(?!type\b)/m.test(text)) {
    fail(file, "contracts package contains a runtime import");
  }
}

for (const stalePath of ["src", "bin", "tests"]) {
  if (await exists(path.join(root, stalePath))) {
    fail(path.join(root, stalePath), "stale root layout path still exists");
  }
}

if (failures.length > 0) {
  console.error(`verify-boundaries failed with ${failures.length} violation(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify-boundaries: ok");
