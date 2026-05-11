import { defineCommand } from "citty";
import serve from "./serve.command.js";
import tools from "./tools.command.js";

export default defineCommand({
  meta: {
    name: "mcp",
    description: "Run solcli as an MCP server or list MCP tools",
  },
  subCommands: { serve, tools },
});
