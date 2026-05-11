import type {
  Blockhash,
  FeePolicy,
  InstructionPlan,
  Lamports,
  Pubkey,
  SignerAlias,
  TransactionPlan,
} from "@solcli/contracts";
import { defineCommand } from "citty";
import { type Context, withContext } from "../../context.js";
import { resolvePort } from "../../operations/resolve-port.js";
import { txExecute } from "../../operations/tx-execute.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_RE = new RegExp(`^[${BASE58_ALPHABET}]{32,44}$`);
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const PLACEHOLDER_BLOCKHASH = "11111111111111111111111111111111";
const ALLOWED_FEE_KINDS = new Set(["none", "recent", "helius", "triton", "jito"]);
const ALLOWED_VIA = new Set(["rpc", "jito"]);

function brandPubkey(ctx: Context, value: string): Pubkey {
  if (!BASE58_RE.test(value)) {
    throw ctx.errors.validation("Invalid pubkey: expected base58 32-44 chars", {
      details: { value, length: value.length },
    });
  }
  return value as Pubkey;
}

function brandLamports(ctx: Context, n: bigint): Lamports {
  if (n < 0n) {
    throw ctx.errors.validation("Lamports must be non-negative", {
      details: { value: n.toString() },
    });
  }
  return n as unknown as Lamports;
}

function parseSolToLamports(ctx: Context, amount: string): Lamports {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw ctx.errors.validation("Invalid SOL amount: expected a non-negative decimal", {
      details: { value: amount },
    });
  }
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = `${frac}000000000`.slice(0, 9);
  const lamports = BigInt(whole ?? "0") * 1_000_000_000n + BigInt(fracPadded || "0");
  return brandLamports(ctx, lamports);
}

function parseFeePolicy(ctx: Context, value: string): FeePolicy {
  if (!ALLOWED_FEE_KINDS.has(value)) {
    throw ctx.errors.validation(
      `Invalid --priority-fee: expected one of ${[...ALLOWED_FEE_KINDS].join(", ")}`,
      { details: { value } },
    );
  }
  if (value === "jito") return { kind: "jito", tipLamports: 0n };
  return { kind: value as "none" | "recent" | "helius" | "triton" };
}

function parseVia(ctx: Context, value: string): "rpc" | "jito" {
  if (!ALLOWED_VIA.has(value)) {
    throw ctx.errors.validation("Invalid --via: expected rpc or jito", {
      details: { value },
    });
  }
  return value as "rpc" | "jito";
}

/**
 * Build a SystemProgram::Transfer plan inline.
 *
 * Wire format (System Program instruction 2):
 *   [0..4]  u32 LE tag = 2
 *   [4..12] u64 LE lamports
 *
 * TODO: migrate to `buildTransferPlan` from `@solcli/protocol-native` once
 * that package is added to the cli app's dependencies and its `src/index.ts`
 * is published by the protocol-native session.
 */
function buildTransferPlan(args: {
  from: Pubkey;
  to: Pubkey;
  lamports: Lamports;
  recentBlockhash: Blockhash;
}): TransactionPlan {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, args.lamports as unknown as bigint, true);

  const instruction: InstructionPlan = {
    programId: args.from === args.to ? args.from : (SYSTEM_PROGRAM as Pubkey),
    keys: [
      { pubkey: args.from, isSigner: true, isWritable: true },
      { pubkey: args.to, isSigner: false, isWritable: true },
    ],
    data,
  };
  // The programId must always be the System Program; the ternary above is
  // a no-op intended only to thread the branded Pubkey through the type
  // system. Force the literal here.
  const fixedInstruction: InstructionPlan = {
    ...instruction,
    programId: SYSTEM_PROGRAM as Pubkey,
  };

  return {
    version: 0,
    payer: args.from,
    recentBlockhash: args.recentBlockhash,
    instructions: [fixedInstruction],
    expectedSigners: [args.from],
  };
}

export default defineCommand({
  meta: {
    name: "transfer",
    description: "Transfer SOL to a recipient address.",
  },
  args: {
    to: {
      type: "positional",
      required: true,
      valueHint: "<recipient-pubkey>",
      description: "Recipient public key in base58",
    },
    "amount-sol": {
      type: "string",
      required: true,
      valueHint: "<sol>",
      description: "Amount to send, denominated in SOL",
    },
    signer: {
      type: "string",
      required: true,
      valueHint: "<alias>",
      description: "Signer alias from the configured signer registry",
    },
    from: {
      type: "string",
      required: false,
      valueHint: "<base58-pubkey>",
      description: "Override the payer pubkey (defaults to the signer's pubkey)",
    },
    simulate: {
      type: "boolean",
      default: true,
      description: "Simulate only; do not send a transaction (default)",
    },
    execute: {
      type: "boolean",
      default: false,
      description: "Send the transaction. Requires --idempotency-key and --max-cost-lamports.",
    },
    "idempotency-key": {
      type: "string",
      required: false,
      valueHint: "<key>",
      description: "Stable key to make --execute retries safe",
    },
    "max-cost-lamports": {
      type: "string",
      required: false,
      valueHint: "<lamports>",
      description: "Hard cost ceiling enforced by the safety gate",
    },
    via: {
      type: "string",
      default: "rpc",
      valueHint: "rpc|jito",
      description: "Send path: standard RPC or Jito bundle",
    },
    "priority-fee": {
      type: "string",
      default: "none",
      valueHint: "none|recent|helius|triton|jito",
      description: "Priority-fee recommendation source",
    },
    network: {
      type: "string",
      default: "devnet",
      description: "Network selector (devnet / testnet / mainnet-beta).",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const signal = ctx.abortController.signal;

      // Stability: state-changing commands default to simulate-first.
      if (args.execute) {
        if (!args["idempotency-key"]) {
          throw ctx.errors.safetyIntent("--idempotency-key is required when --execute is set", {
            details: { flag: "idempotency-key" },
          });
        }
        if (!args["max-cost-lamports"]) {
          throw ctx.errors.safetyIntent("--max-cost-lamports is required when --execute is set", {
            details: { flag: "max-cost-lamports" },
          });
        }
      }

      const to = brandPubkey(ctx, String(args.to));
      const lamports = parseSolToLamports(ctx, String(args["amount-sol"]));
      const from = args.from
        ? brandPubkey(ctx, String(args.from))
        : // TODO: wiring -- resolve from ctx.signers.get(alias).pubkey() once
          // the signer manager is exposed on Context. Until then --from is
          // required for state-changing flows.
          (() => {
            if (args.execute) {
              throw ctx.errors.validation(
                "--from is required while signer pubkey resolution is pending wiring",
                { details: { signer: String(args.signer) } },
              );
            }
            return brandPubkey(ctx, String(args.to));
          })();

      // Recent blockhash. The placeholder lets simulate-only invocations work
      // against fixtures; the live path requires the wiring session to attach
      // a refreshBlockhash port (or upgrade the RPC client) to the context.
      // TODO: wiring -- replace with ctx.ports.refreshBlockhash({ signal }).
      const recentBlockhash: Blockhash = PLACEHOLDER_BLOCKHASH as Blockhash;
      try {
        const port = resolvePort(ctx.providers, "getTransaction").port;
        void port; // type-thread; the real refresh path is provider-specific.
      } catch {
        // optional path; leave the placeholder in place
      }

      const plan = buildTransferPlan({ from, to, lamports, recentBlockhash });

      const feePolicy = parseFeePolicy(ctx, String(args["priority-fee"]));
      const via = parseVia(ctx, String(args.via));

      if (!args.execute) {
        // Simulate-only path. We resolve the simulate port lazily so the
        // input-validation tests can exercise this code without a configured
        // simulate provider.
        let simulation: unknown = null;
        let simulateError: string | undefined;
        try {
          const port = resolvePort(ctx.providers, "simulateTransaction").port;
          simulation = await port.simulate(plan, {
            signal,
            replaceRecentBlockhash: true,
            sigVerify: false,
          });
        } catch (err: unknown) {
          simulateError = (err as Error).message;
          ctx.logger.debug({ err }, "transfer simulate (no simulateTransaction port)");
        }
        await ctx.output.write({
          kind: "transfer.simulation",
          data: {
            plan: {
              instructions: plan.instructions.length,
              payer: plan.payer,
              recentBlockhash: plan.recentBlockhash,
            },
            transfer: {
              from,
              to,
              lamports: (lamports as unknown as bigint).toString(),
            },
            simulation,
            ...(simulateError !== undefined ? { simulateError } : {}),
          },
          meta: { network: String(args.network) },
        });
        return;
      }

      const maxCost = BigInt(String(args["max-cost-lamports"]));
      const result = await txExecute(ctx, {
        plan,
        alias: String(args.signer) as unknown as SignerAlias,
        feePolicy,
        execute: true,
        idempotencyKey: String(args["idempotency-key"]),
        maxCostLamports: maxCost,
        allowedPrograms: [SYSTEM_PROGRAM],
        via,
        signal,
      });
      if (!result.ok) {
        throw result.error;
      }
      await ctx.output.write({
        kind: "transfer.result",
        data: {
          signature: result.value.signature,
          from,
          to,
          lamports: (lamports as unknown as bigint).toString(),
          intent: result.value.intent,
        },
        meta: { network: String(args.network) },
      });
    });
  },
});
