import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "rm", description: "Delete a stored secret" },
  args: {
    name: { type: "positional", required: true, valueHint: "<name>" },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      if (!ctx.flags.yes && !ctx.flags.noInput) {
        const ok = await ctx.prompts.confirm({
          message: `Delete secret '${String(args.name)}'?`,
          initial: false,
        });
        if (!ok) {
          throw ctx.errors.nonInteractive(`User declined to delete secret`);
        }
      }
      await ctx.secrets.delete(String(args.name));
      await ctx.output.write({ deleted: String(args.name), backend: ctx.secrets.backend() });
    });
  },
});
