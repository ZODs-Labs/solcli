import os from "node:os";
import process from "node:process";
import { defineCommand } from "citty";
import { withContext } from "../context.js";

interface Check {
  name: string;
  status: "ok" | "warn" | "error";
  detail?: string | undefined;
  data?: unknown;
}

export default defineCommand({
  meta: { name: "doctor", description: "Diagnose solcli installation and configuration" },
  async run() {
    return withContext(async (ctx) => {
      const checks: Check[] = [];

      checks.push({
        name: "node",
        status: "ok",
        data: { version: process.version, platform: process.platform, arch: process.arch },
      });

      checks.push({
        name: "os",
        status: "ok",
        data: { type: os.type(), release: os.release(), totalMem: os.totalmem() },
      });

      checks.push({
        name: "paths",
        status: "ok",
        data: ctx.paths,
      });

      checks.push(
        await safeCheck("config", async () => ({
          profile: ctx.config.activeProfile(),
          path: ctx.config.configPath(),
          effective: ctx.config.read(),
        })),
      );

      checks.push(
        await safeCheck("secrets", async () => {
          const names = await ctx.secrets.list();
          return { backend: ctx.secrets.backend(), count: names.length };
        }),
      );

      const activeProvider = ctx.providers.active();
      checks.push({
        name: "providers",
        status: activeProvider ? "ok" : "warn",
        detail: activeProvider ? undefined : "no active provider configured",
        data: {
          active: activeProvider?.manifest.name ?? null,
          registered: ctx.providers.list().map((p) => p.manifest.name),
          ports: ctx.portNames,
        },
      });

      checks.push({
        name: "output-formats",
        status: "ok",
        data: { supported: ["human", "json", "ndjson", "csv"] },
      });

      const overall = checks.some((c) => c.status === "error") ? "error" : "ok";

      await ctx.output.write({ overall, checks });
      if (overall === "error") {
        process.exitCode = 1;
      }
    });
  },
});

async function safeCheck(name: string, fn: () => Promise<unknown>): Promise<Check> {
  try {
    const data = await fn();
    return { name, status: "ok", data };
  } catch (err: unknown) {
    return {
      name,
      status: "error",
      detail: (err as Error).message ?? String(err),
    };
  }
}
