import { defineCommand } from "citty";
import { withContext } from "../../context.js";
import { bootstrapExtensionHost } from "../../extensions/host.js";

export default defineCommand({
  meta: {
    name: "remove",
    description: "Remove an installed plugin and update the registry atomically",
  },
  args: {
    id: { type: "positional", required: true, valueHint: "<id>" },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const host = bootstrapExtensionHost({ paths: ctx.paths, logger: ctx.logger });
      const id = String(args.id);
      await host.remove(id, ctx.abortController.signal);
      await ctx.output.write({
        kind: "plugin.remove",
        data: { id, removed: true },
        meta: { dataDir: ctx.paths.data },
      });
    });
  },
});
