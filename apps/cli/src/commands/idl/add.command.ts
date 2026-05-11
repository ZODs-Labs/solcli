import { defineCommand } from "citty";
import { withContext } from "../../context.js";
import { idlAdd } from "../../operations/idl-load.js";

export default defineCommand({
  meta: {
    name: "add",
    description: "Cache an Anchor IDL by program id; synthesizes tier-0 alpha commands",
  },
  args: {
    programId: {
      type: "positional",
      required: true,
      valueHint: "<programId>",
      description: "Base58 program id (32-44 chars)",
    },
    "from-path": {
      type: "string",
      required: false,
      description: "Read the IDL JSON from a local file instead of fetching on-chain",
    },
    label: {
      type: "string",
      required: false,
      description: "Optional user-visible label for solcli idl call <label> ...",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const programId = String(args.programId);
      const fromPath = readOpt(args, "from-path");
      const label = readOpt(args, "label");
      const input: { programId: string; fromPath?: string; label?: string } = { programId };
      if (fromPath !== undefined) input.fromPath = fromPath;
      if (label !== undefined) input.label = label;
      const result = await idlAdd(ctx, input);
      await ctx.output.write({
        kind: "idl.add",
        data: result,
        meta: { profile: ctx.config.activeProfile() },
      });
    });
  },
});

function readOpt(args: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const v = args[key];
  if (typeof v === "string" && v !== "") return v;
  return undefined;
}
