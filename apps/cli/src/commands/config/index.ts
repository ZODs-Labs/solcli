import { defineCommand } from "citty";
import get from "./get.command.js";
import list from "./list.command.js";
import set from "./set.command.js";

export default defineCommand({
  meta: { name: "config", description: "Read and write solcli configuration" },
  subCommands: { get, set, list },
});
