import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "get", description: "Read a config value" },
  args: {
    key: {
      type: "positional",
      required: true,
      valueHint: "<key>",
      description: "Dotted key, e.g. network or rpc.primary",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const value = ctx.config.get(String(args.key));
      if (value === undefined) {
        throw ctx.errors.usage(`Config key not found: ${String(args.key)}`, {
          details: { key: String(args.key) },
        });
      }
      await ctx.output.write({ key: String(args.key), value });
    });
  },
});
