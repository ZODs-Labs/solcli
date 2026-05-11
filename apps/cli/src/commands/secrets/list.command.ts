import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "list", description: "List stored secret names (never values)" },
  async run() {
    return withContext(async (ctx) => {
      const names = await ctx.secrets.list();
      await ctx.output.write({
        backend: ctx.secrets.backend(),
        count: names.length,
        names,
      });
    });
  },
});
