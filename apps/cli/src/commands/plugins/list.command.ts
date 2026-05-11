import { defineCommand } from "citty";
import { withContext } from "../../context.js";
import { bootstrapExtensionHost } from "../../extensions/host.js";

export default defineCommand({
  meta: { name: "list", description: "List installed plugins recorded in the plugin registry" },
  async run() {
    return withContext(async (ctx) => {
      const host = bootstrapExtensionHost({ paths: ctx.paths, logger: ctx.logger });
      const manifests = await host.listInstalled();
      const overlays = host.listManifestOverlays();
      await ctx.output.write({
        kind: "plugin.list",
        data: {
          plugins: manifests.map((m) => ({
            name: m.name,
            version: m.version,
            trust: m.trust,
            integrity: m.integrity,
            contributes: m.contributes,
          })),
          overlays: overlays.map((o) => ({
            commandPath: o.commandPath,
            stability: o.entry.stability,
            tier: o.entry.tier,
            contributedBy: o.contributedBy,
          })),
        },
        meta: {
          dataDir: ctx.paths.data,
          configDir: ctx.paths.config,
        },
      });
    });
  },
});
