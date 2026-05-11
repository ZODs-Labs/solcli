import { defineCommand } from "citty";
import add from "./add.command.js";
import call from "./call.command.js";
import list from "./list.command.js";
import remove from "./remove.command.js";

export default defineCommand({
  meta: { name: "idl", description: "Cache and invoke Anchor IDLs as tier-0 alpha commands" },
  subCommands: { add, list, call, remove },
});
