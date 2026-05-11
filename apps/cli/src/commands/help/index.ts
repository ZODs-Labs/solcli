import { defineCommand } from "citty";
import exitCodes from "./exit-codes.command.js";
import formatting from "./formatting.command.js";
import jsonOutput from "./json-output.command.js";
import providers from "./providers.command.js";

export default defineCommand({
  meta: { name: "help", description: "Topic-based help pages" },
  subCommands: {
    "exit-codes": exitCodes,
    "json-output": jsonOutput,
    providers,
    formatting,
  },
});
