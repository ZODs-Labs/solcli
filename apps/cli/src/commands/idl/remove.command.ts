import { defineCommand } from "citty";
import { withContext } from "../../context.js";
import { idlRemove } from "../../operations/idl-load.js";

export default defineCommand({
  meta: { name: "remove", description: "Atomically delete a cached Anchor IDL" },
  args: {
    programIdOrLabel: {
      type: "positional",
      required: true,
      valueHint: "<programId | label>",
      description: "The base58 program id or its user-set label",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const result = await idlRemove(ctx, { programIdOrLabel: String(args.programIdOrLabel) });
      await ctx.output.write({
        kind: "idl.remove",
        data: result,
        meta: { profile: ctx.config.activeProfile() },
      });
    });
  },
});
