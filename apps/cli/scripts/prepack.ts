#!/usr/bin/env tsx
/**
 * prepack: stage LICENSE at the package root so `npm pack` ships it.
 *
 * The workspace LICENSE lives one level up, but npm's `files` allowlist
 * resolves relative to the package directory. README is authored in-package
 * and does not need staging.
 */
import { copyFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PKG_ROOT = path.resolve(HERE, "..");
const WORKSPACE_ROOT = path.resolve(PKG_ROOT, "..", "..");

async function main(): Promise<void> {
  await copyFile(path.join(WORKSPACE_ROOT, "LICENSE"), path.join(PKG_ROOT, "LICENSE"));
  process.stdout.write("prepack: staged LICENSE\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`prepack failed: ${String(err)}\n`);
  process.exit(1);
});
