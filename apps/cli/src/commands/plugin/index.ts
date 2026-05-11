import { defineCommand } from "citty";
import example from "./example.command.js";

export default defineCommand({
  meta: { name: "plugin", description: "Template/reference commands for contributors" },
  subCommands: { example },
});
