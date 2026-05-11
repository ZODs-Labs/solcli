import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..", "..");
const TEMP_CMD = path.join(PROJECT_ROOT, "src", "commands", "_it_added.command.ts");
const REGISTRY = path.join(PROJECT_ROOT, "src", "generated", "commands.ts");

const BODY = `import { defineCommand } from "citty";
import { withContext } from "../context.js";
export default defineCommand({
  meta: { name: "_it_added", description: "AC10 smoke" },
  async run() {
    return withContext(async (ctx) => {
      await ctx.output.write({ added: true });
    });
  },
});
`;

describe("AC10 - single-file command add", () => {
  it("dropping a *.command.ts under src/commands is auto-discovered by build-registry", async () => {
    await writeFile(TEMP_CMD, BODY, "utf8");
    try {
      const r = await execa("pnpm", ["exec", "tsx", "scripts/build-registry.ts"], {
        cwd: PROJECT_ROOT,
        reject: false,
      });
      expect(r.exitCode).toBe(0);
      const generated = await readFile(REGISTRY, "utf8");
      expect(generated).toContain("_it_added");
      expect(generated).toContain('"../commands/_it_added.command.js"');
    } finally {
      await unlink(TEMP_CMD).catch(() => {});
      await execa("pnpm", ["exec", "tsx", "scripts/build-registry.ts"], {
        cwd: PROJECT_ROOT,
        reject: false,
      }).catch(() => {});
    }
  }, 60_000);
});
