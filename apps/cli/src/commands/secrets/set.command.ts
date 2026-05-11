import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: {
    name: "set",
    description: "Store a secret in the OS keyring (or encrypted-file fallback)",
  },
  args: {
    name: { type: "positional", required: true, valueHint: "<name>" },
    value: {
      type: "string",
      required: false,
      description: "Secret value. If omitted, prompts when TTY.",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      let value = args.value;
      if (value === undefined || value === "") {
        if (ctx.flags.noInput) {
          throw ctx.errors.nonInteractive(
            "Secret value required (--value <v>) in non-interactive mode",
          );
        }
        value = await ctx.prompts.password({ message: `Value for ${String(args.name)}:` });
      }
      if (!value) {
        throw ctx.errors.usage("Secret value must be non-empty");
      }
      await ctx.secrets.set(String(args.name), value);
      await ctx.output.write({
        name: String(args.name),
        backend: ctx.secrets.backend(),
      });
    });
  },
});
