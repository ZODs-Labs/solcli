import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "set", description: "Set a config value (writes config.toml atomically)" },
  args: {
    key: { type: "positional", required: true, valueHint: "<key>" },
    value: { type: "positional", required: true, valueHint: "<value>" },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const value = parseScalar(String(args.value));
      await ctx.config.set(String(args.key), value);
      await ctx.output.write({
        updated: { key: String(args.key), value },
        configPath: ctx.config.configPath(),
        profile: ctx.config.activeProfile(),
      });
    });
  },
});

function parseScalar(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return Number.parseFloat(raw);
  return raw;
}
