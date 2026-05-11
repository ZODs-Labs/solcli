import { defineCommand } from "citty";
import { withContext } from "../../context.js";
import { bootstrapExtensionHost } from "../../extensions/host.js";

export default defineCommand({
  meta: {
    name: "verify",
    description: "Verify an installed plugin's manifest and integrity",
  },
  args: {
    id: { type: "positional", required: true, valueHint: "<id>" },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const host = bootstrapExtensionHost({ paths: ctx.paths, logger: ctx.logger });
      const id = String(args.id);
      const result = await host.verifyInstalled(id, ctx.abortController.signal);
      await ctx.output.write({
        kind: "plugin.verify",
        data: {
          id: result.id,
          integrity: result.integrity,
          ok: result.ok,
        },
        meta: {
          dataDir: ctx.paths.data,
        },
      });
      if (!result.ok) {
        throw ctx.errors.usage(`Plugin '${id}' failed verification`);
      }
    });
  },
});
