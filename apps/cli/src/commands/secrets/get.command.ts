import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: {
    name: "get",
    description: "Read a secret. By default, masks the value; --reveal prints it.",
  },
  args: {
    name: { type: "positional", required: true, valueHint: "<name>" },
    reveal: { type: "boolean", default: false, description: "Print the plaintext value to stdout" },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const value = await ctx.secrets.get(String(args.name));
      if (value === null) {
        throw ctx.errors.secret(`Secret not found: ${String(args.name)}`);
      }
      if (!args.reveal) {
        await ctx.output.write({
          name: String(args.name),
          present: true,
          backend: ctx.secrets.backend(),
        });
        return;
      }
      if (!ctx.flags.yes && !ctx.flags.noInput) {
        const ok = await ctx.prompts.confirm({
          message: `Reveal secret '${String(args.name)}'? It will be printed to stdout.`,
          initial: false,
        });
        if (!ok) {
          throw ctx.errors.nonInteractive(`User declined to reveal secret`);
        }
      }
      await ctx.output.write({ name: String(args.name), value });
    });
  },
});
