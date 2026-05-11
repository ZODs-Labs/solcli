import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "list", description: "Show effective config and active profile" },
  async run() {
    return withContext(async (ctx) => {
      await ctx.output.write({
        profile: ctx.config.activeProfile(),
        configPath: ctx.config.configPath(),
        effective: ctx.config.read(),
      });
    });
  },
});
