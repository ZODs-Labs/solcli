import { defineCommand } from "citty";
import { withContext } from "../../context.js";
import { idlCall } from "../../operations/idl-load.js";

export default defineCommand({
  meta: {
    name: "call",
    description: "Invoke a synthesized command for an instruction of a cached Anchor IDL",
  },
  args: {
    programIdOrLabel: {
      type: "positional",
      required: true,
      valueHint: "<programId | label>",
      description: "The base58 program id or the user-set label",
    },
    ix: {
      type: "positional",
      required: true,
      valueHint: "<instruction>",
      description: "Instruction name from the IDL",
    },
    signer: {
      type: "string",
      required: false,
      description: "Signer alias used by TransactionService",
    },
    "idempotency-key": {
      type: "string",
      required: false,
      description: "ULID for deduplicating retries",
    },
    simulate: {
      type: "boolean",
      default: false,
      description: "Run a simulation rather than sending",
    },
    execute: { type: "boolean", default: false, description: "Send the transaction" },
  },
  async run({ args, rawArgs }) {
    return withContext(async (ctx) => {
      const programIdOrLabel = String(args.programIdOrLabel);
      const ix = String(args.ix);
      const simulate = Boolean(args.simulate);
      const execute = Boolean(args.execute);
      if (simulate && execute) {
        throw ctx.errors.usage("--simulate and --execute are mutually exclusive");
      }
      const signer = readOpt(args, "signer");
      const idempotencyKey = readOpt(args, "idempotency-key");
      const extras = readExtraFlags(rawArgs);
      const input: Parameters<typeof idlCall>[1] = {
        programIdOrLabel,
        ix,
        args: extras,
        simulate,
        execute,
      };
      if (signer !== undefined) {
        (input as { signer?: string }).signer = signer;
      }
      if (idempotencyKey !== undefined) {
        (input as { idempotencyKey?: string }).idempotencyKey = idempotencyKey;
      }
      const outcome = await idlCall(ctx, input);
      await ctx.output.write({
        kind: "idl.call",
        data: outcome,
        meta: { profile: ctx.config.activeProfile() },
      });
    });
  },
});

function readOpt(args: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const v = args[key];
  if (typeof v === "string" && v !== "") return v;
  return undefined;
}

const RESERVED = new Set([
  "signer",
  "idempotency-key",
  "simulate",
  "execute",
  "output",
  "network",
  "profile",
  "verbose",
  "quiet",
  "no-color",
  "no-input",
  "no-cache",
  "yes",
]);

/**
 * Citty rolls user-supplied --foo flags into args, but we want to forward only
 * those the IDL instruction declares. Pull them out of the raw argv so an
 * agent can pass arbitrary --<arg> values without us having to predeclare
 * each one.
 */
function readExtraFlags(rawArgs: readonly string[]): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < rawArgs.length) {
    const tok = rawArgs[i];
    if (typeof tok !== "string" || !tok.startsWith("--")) {
      i += 1;
      continue;
    }
    const body = tok.slice(2);
    const eq = body.indexOf("=");
    let key: string;
    let value: string;
    if (eq >= 0) {
      key = body.slice(0, eq);
      value = body.slice(eq + 1);
      i += 1;
    } else {
      key = body;
      const next = rawArgs[i + 1];
      if (typeof next === "string" && !next.startsWith("--")) {
        value = next;
        i += 2;
      } else {
        value = "true";
        i += 1;
      }
    }
    if (RESERVED.has(key) || key === "") continue;
    out[key] = value;
  }
  return Object.freeze(out);
}
