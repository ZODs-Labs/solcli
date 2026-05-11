#!/usr/bin/env tsx
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { rootSubCommands } from "../src/generated/commands.js";
import { buildTree } from "../src/manifest/build.js";

const PROJECT_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_FILE = path.join(PROJECT_ROOT, "src", "generated", "manifest.json");

async function main(): Promise<void> {
  const cliVersion = process.env["SOLCLI_VERSION"] ?? "0.0.1";
  const manifest = await buildTree(rootSubCommands, cliVersion);
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(OUTPUT_FILE, body, "utf8");
  const count = Object.keys(manifest.commands).length;
  // eslint-disable-next-line no-console
  console.error(
    `build-manifest: wrote ${count} commands to ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`,
  );
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("build-manifest failed:", err);
  process.exit(1);
});
