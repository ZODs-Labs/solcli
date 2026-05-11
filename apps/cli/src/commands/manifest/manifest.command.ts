import { defineCommand } from "citty";
import { type Context, withContext } from "../../context.js";
import type { CapabilityManifest } from "../../manifest/build.js";
import { loadManifest } from "../../manifest/runtime.js";

export type ManifestLoader = (opts: { includeAlpha: boolean }) => Promise<CapabilityManifest>;

export async function executeManifest(
  ctx: Context,
  format: string,
  includeAlpha: boolean,
  loader: ManifestLoader = (opts) => loadManifest(opts),
): Promise<void> {
  if (format !== "json" && format !== "ndjson" && format !== "yaml") {
    throw ctx.errors.usage(`unknown --format ${format}`, { details: { format } });
  }
  const manifest = await loader({ includeAlpha });
  const generatedAt = new Date().toISOString();
  if (format === "yaml") {
    ctx.logger.warn(
      { format },
      "manifest: yaml output is pending a YAML dependency; falling back to JSON",
    );
  }
  if (format === "ndjson") {
    for (const path of Object.keys(manifest.commands)) {
      const entry = manifest.commands[path];
      if (entry === undefined) continue;
      await ctx.output.write({ kind: "manifest.entry", data: entry });
    }
    return;
  }
  await ctx.output.write({
    kind: "manifest.tree",
    data: manifest,
    meta: { cliVersion: manifest.cliVersion, generatedAt },
  });
}

export default defineCommand({
  meta: { name: "manifest", description: "Print the capability manifest tree." },
  args: {
    format: {
      type: "string",
      valueHint: "json|ndjson|yaml",
      default: "json",
      description: "Output format. json (default), ndjson or yaml.",
    },
    "include-alpha": {
      type: "boolean",
      default: false,
      description: "Include commands marked alpha. Hidden by default.",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const format = String(args.format ?? "json");
      const includeAlpha = args["include-alpha"] === true;
      await executeManifest(ctx, format, includeAlpha);
    });
  },
});
