import { defineCommand } from "citty";
import { withContext } from "../../context.js";

export default defineCommand({
  meta: { name: "serve", description: "Run solcli as an MCP server over stdio" },
  args: {
    transport: {
      type: "string",
      valueHint: "stdio|http-sse",
      default: "stdio",
      description: "Transport: stdio (supported in v1) or http-sse (deferred)",
    },
    "include-alpha": {
      type: "boolean",
      default: false,
      description: "Include alpha-stability tools in the served manifest",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const transport = String(args.transport ?? "stdio");
      if (transport === "http-sse") {
        throw ctx.errors.usage(
          "HTTP+SSE transport is not implemented in v1; use --transport stdio. Downstream flow: mcp-http-sse-transport.",
          { details: { errorCode: "SOLCLI_E_MCP_TRANSPORT_UNSUPPORTED" } },
        );
      }
      if (transport !== "stdio") {
        throw ctx.errors.usage(`unknown MCP transport: ${transport}`, {
          details: { transport },
        });
      }
      const { bootMcpServer } = await import("../../mcp/server.js");
      await bootMcpServer({
        ctx,
        includeAlpha: Boolean(args["include-alpha"]),
      });
    });
  },
});
