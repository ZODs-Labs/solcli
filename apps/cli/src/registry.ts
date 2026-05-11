import { defineCommand } from "citty";
import { buildContext, type GlobalFlags, setCurrentContext } from "./context.js";
import { rootSubCommands } from "./generated/commands.js";

const version = process.env["SOLCLI_VERSION"] ?? "0.0.1";

// Default to JSON off-TTY only when the user did not pass `--output` explicitly.
// Citty's parsed args don't distinguish "user-typed" from "default-filled".
function resolveOutputMode(
  parsed: GlobalFlags["output"],
  rawArgs: string[],
): GlobalFlags["output"] {
  const explicit = rawArgs.some(
    (a) =>
      a === "--output" ||
      a === "-o" ||
      a.startsWith("--output=") ||
      a.startsWith("-o=") ||
      a === "--json",
  );
  if (explicit) return parsed;
  if (!process.stdout.isTTY) return "json";
  return parsed;
}

export const rootCommand = defineCommand({
  meta: {
    name: "solcli",
    version,
    description: "Cross-platform Solana CLI for humans and agents",
  },
  args: {
    output: {
      type: "enum",
      options: ["human", "json", "ndjson", "csv"],
      default: "human",
      description: "Output format",
    },
    network: {
      type: "string",
      description: "Network: mainnet-beta | devnet | testnet | <custom URL>",
    },
    profile: {
      type: "string",
      description: "Named profile from config.toml",
    },
    verbose: { type: "boolean", default: false, description: "Verbose logs to stderr" },
    quiet: { type: "boolean", default: false, description: "Suppress non-essential output" },
    "no-color": {
      type: "boolean",
      default: false,
      description: "Disable ANSI color (also NO_COLOR)",
    },
    "no-input": {
      type: "boolean",
      default: false,
      description: "Fail-fast on prompts (also CI / NO_INPUT)",
    },
    "no-cache": { type: "boolean", default: false, description: "Bypass cache" },
    yes: { type: "boolean", default: false, description: "Skip confirmation prompts" },
  },
  subCommands: rootSubCommands,
  async setup({ args, rawArgs }) {
    const flags: GlobalFlags = {
      output: resolveOutputMode(args.output as GlobalFlags["output"], rawArgs),
      verbose: Boolean(args.verbose),
      quiet: Boolean(args.quiet),
      noColor: Boolean(args["no-color"]),
      noInput: Boolean(args["no-input"]),
      noCache: Boolean(args["no-cache"]),
      yes: Boolean(args.yes),
    };
    if (args.network) flags.network = String(args.network);
    if (args.profile) flags.profile = String(args.profile);
    const ctx = await buildContext(flags);
    setCurrentContext(ctx);
    ctx.versionCheck.maybeNotify();
  },
  async cleanup() {
    const mod = await import("./context.js");
    const ctx = mod.getCurrentContext();
    if (ctx) await ctx.teardown();
  },
});
