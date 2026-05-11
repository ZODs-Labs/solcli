import { defineCommand } from "citty";
import { withContext } from "../../context.js";
import { idlList } from "../../operations/idl-load.js";

export default defineCommand({
  meta: { name: "list", description: "List cached Anchor IDLs and their instruction counts" },
  async run() {
    return withContext(async (ctx) => {
      const result = await idlList(ctx);
      await ctx.output.write({
        kind: "idl.list",
        data: result,
        meta: { profile: ctx.config.activeProfile() },
      });
    });
  },
});
