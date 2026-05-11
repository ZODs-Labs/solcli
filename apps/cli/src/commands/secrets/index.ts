import { defineCommand } from "citty";
import get from "./get.command.js";
import list from "./list.command.js";
import rm from "./rm.command.js";
import set from "./set.command.js";

export default defineCommand({
  meta: { name: "secrets", description: "Manage solcli secrets (API keys, etc.)" },
  subCommands: { set, get, list, rm },
});
