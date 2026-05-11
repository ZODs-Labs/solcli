#!/usr/bin/env tsx
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const COMMANDS_ROOT = path.join(PROJECT_ROOT, "src", "commands");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "src", "generated", "commands.ts");

interface Entry {
  name: string;
  importPath: string;
  children?: Entry[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function discoverDir(dir: string, importBase: string): Promise<Entry[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Entry[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      const childDir = path.join(dir, e.name);
      const idx = path.join(childDir, "index.ts");
      if (await exists(idx)) {
        out.push({
          name: e.name,
          importPath: `${importBase}/${e.name}/index.js`,
        });
      } else {
        const children = await discoverDir(childDir, `${importBase}/${e.name}`);
        if (children.length > 0) {
          out.push({
            name: e.name,
            importPath: "",
            children,
          });
        }
      }
    } else if (e.isFile() && e.name.endsWith(".command.ts")) {
      const cmdName = e.name.slice(0, -".command.ts".length);
      out.push({
        name: cmdName,
        importPath: `${importBase}/${e.name.replace(/\.ts$/, ".js")}`,
      });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function discover(): Promise<Entry[]> {
  return discoverDir(COMMANDS_ROOT, "../commands");
}

function renderEntry(e: Entry, indent: string): string {
  if (e.children) {
    const childLines = e.children.map((child) => renderEntry(child, `${indent}    `));
    return `${indent}${JSON.stringify(e.name)}: () => Promise.resolve(defineCommand({ meta: { name: ${JSON.stringify(e.name)} }, subCommands: {\n${childLines.join("\n")}\n${indent}} })),`;
  }
  return `${indent}${JSON.stringify(e.name)}: () => import(${JSON.stringify(e.importPath)}).then((m) => m.default),`;
}

function render(entries: Entry[]): string {
  const lines: string[] = [
    "// AUTO-GENERATED - do not edit by hand. Run `pnpm build` to regenerate.",
    "// Source: scripts/build-registry.ts",
    "",
    'import { defineCommand, type CommandDef } from "citty";',
    "",
    "export const rootSubCommands: Record<string, () => Promise<CommandDef>> = {",
  ];
  for (const e of entries) {
    lines.push(renderEntry(e, "  "));
  }
  lines.push("};", "");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const entries = await discover();
  const body = render(entries);
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, body, "utf8");
  // eslint-disable-next-line no-console
  console.error(
    `build-registry: wrote ${entries.length} commands to ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("build-registry failed:", err);
  process.exit(1);
});
