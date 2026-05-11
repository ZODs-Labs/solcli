import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "tools", description: "List MCP tools exposed by this CLI" },
  args: {
    "include-alpha": {
      type: "boolean",
      default: false,
      description: "Include alpha-stability tools in the listing",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const { loadMcpToolList } = await import("../../operations/mcp-tools.js");
      const tools = await loadMcpToolList(ctx, {
        includeAlpha: Boolean(args["include-alpha"]),
      });
      await ctx.output.write({
        kind: "mcp.tools",
        data: tools,
        meta: { cliVersion: process.env["SOLCLI_VERSION"] ?? "0.0.1" },
      });
    });
  },
});
