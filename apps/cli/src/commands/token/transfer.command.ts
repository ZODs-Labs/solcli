import type {
  Blockhash,
  FeePolicy,
  MintAddress,
  Pubkey,
  SignerAlias,
  TokenAccount,
  TokenAmount,
} from "@solcli/contracts";
import { buildTokenTransferMessage } from "@solcli/protocol-spl-token";
import { defineCommand } from "citty";
import { type Context, withContext } from "../../context.js";
import { resolvePort } from "../../operations/resolve-port.js";
import { txExecute } from "../../operations/tx-execute.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_RE = new RegExp(`^[${BASE58_ALPHABET}]{32,44}$`);
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
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

function brandTokenAmount(ctx: Context, n: bigint): TokenAmount {
  if (n < 0n) {
    throw ctx.errors.validation("Token amount must be non-negative", {
      details: { value: n.toString() },
    });
  }
  return n as unknown as TokenAmount;
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

async function refuseToken2022(ctx: Context, programOwner: string | undefined): Promise<void> {
  if (programOwner === TOKEN_2022_PROGRAM) {
    throw ctx.errors.validation(
      "Token-2022 transfer extensions are deferred; see downstream flow token-2022-extensions.",
      { details: { mintProgram: programOwner } },
    );
  }
}

export default defineCommand({
  meta: {
    name: "transfer",
    description: "Transfer SPL tokens to a destination token account.",
  },
  args: {
    to: {
      type: "positional",
      required: true,
      valueHint: "<destination-token-account>",
      description: "Destination token account (base58)",
    },
    mint: {
      type: "string",
      required: true,
      valueHint: "<mint>",
      description: "Token mint address (base58)",
    },
    amount: {
      type: "string",
      required: true,
      valueHint: "<u64>",
      description: "Raw token amount in base units (mint-specific decimals)",
    },
    decimals: {
      type: "string",
      required: true,
      valueHint: "<u8>",
      description: "Decimals for the mint (0-9)",
    },
    source: {
      type: "string",
      required: true,
      valueHint: "<source-token-account>",
      description: "Source token account (base58)",
    },
    signer: {
      type: "string",
      required: true,
      valueHint: "<alias>",
      description: "Signer alias from the configured signer registry",
    },
    owner: {
      type: "string",
      required: false,
      valueHint: "<base58-pubkey>",
      description: "Override the owner pubkey (defaults to the signer's pubkey)",
    },
    "mint-program": {
      type: "string",
      required: false,
      valueHint: "<token|token-2022>",
      description: "Override the mint program when account-info lookup is unavailable",
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
    },
    "max-cost-lamports": {
      type: "string",
      required: false,
      valueHint: "<lamports>",
    },
    via: {
      type: "string",
      default: "rpc",
      valueHint: "rpc|jito",
    },
    "priority-fee": {
      type: "string",
      default: "none",
      valueHint: "none|recent|helius|triton|jito",
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

      const mint = brandPubkey(ctx, String(args.mint)) as unknown as MintAddress;
      const source = brandPubkey(ctx, String(args.source)) as unknown as TokenAccount;
      const destination = brandPubkey(ctx, String(args.to)) as unknown as TokenAccount;
      const owner = args.owner
        ? brandPubkey(ctx, String(args.owner))
        : (() => {
            if (args.execute) {
              throw ctx.errors.validation(
                "--owner is required while signer pubkey resolution is pending wiring",
                { details: { signer: String(args.signer) } },
              );
            }
            return brandPubkey(ctx, String(args.to));
          })();

      const decimals = Number.parseInt(String(args.decimals), 10);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
        throw ctx.errors.validation("--decimals must be an integer in [0, 9]", {
          details: { value: String(args.decimals) },
        });
      }

      const rawAmount = String(args.amount);
      if (!/^\d+$/.test(rawAmount)) {
        throw ctx.errors.validation("--amount must be a non-negative integer", {
          details: { value: rawAmount },
        });
      }
      const amount = brandTokenAmount(ctx, BigInt(rawAmount));

      // Auto-detect the mint's owning program via getAccountInfo. The classic
      // SPL Token program is the default; Token-2022 mints are refused for v1
      // until extension support lands. An explicit --mint-program override
      // short-circuits the lookup for offline simulate runs.
      const mintProgramOverride = args["mint-program"];
      if (mintProgramOverride === "token-2022") {
        await refuseToken2022(ctx, TOKEN_2022_PROGRAM);
      } else if (typeof mintProgramOverride === "string" && BASE58_RE.test(mintProgramOverride)) {
        await refuseToken2022(ctx, mintProgramOverride);
      } else if (mintProgramOverride === undefined) {
        try {
          const accountInfoPort = resolvePort(ctx.providers, "getAccountInfo").port;
          const mintAccount = await accountInfoPort.getAccountInfo(mint as Pubkey, { signal });
          if (mintAccount !== null) {
            await refuseToken2022(ctx, mintAccount.owner as unknown as string);
          }
        } catch (err) {
          // If the provider doesn't expose getAccountInfo (e.g. offline tests),
          // skip the auto-detection. The user can force the program via
          // --mint-program=<token|token-2022> when they need to.
          ctx.logger.debug({ err }, "token transfer mint-program autodetect skipped");
        }
      }

      // TODO: wiring -- replace with ctx.ports.refreshBlockhash({ signal }).
      const recentBlockhash: Blockhash = PLACEHOLDER_BLOCKHASH as Blockhash;

      const plan = buildTokenTransferMessage({
        source,
        destination,
        mint,
        owner,
        amount,
        decimals,
        recentBlockhash,
      });

      const feePolicy = parseFeePolicy(ctx, String(args["priority-fee"]));
      const via = parseVia(ctx, String(args.via));

      if (!args.execute) {
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
          ctx.logger.debug({ err }, "token-transfer simulate (no simulateTransaction port)");
        }
        await ctx.output.write({
          kind: "token.transfer.simulation",
          data: {
            plan: {
              instructions: plan.instructions.length,
              payer: plan.feePayer.address,
              recentBlockhash: plan.lifetimeConstraint.blockhash,
            },
            transfer: {
              source,
              destination,
              mint,
              amount: (amount as unknown as bigint).toString(),
              decimals,
              owner,
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
        allowedPrograms: [TOKEN_PROGRAM],
        via,
        signal,
      });
      if (!result.ok) {
        throw result.error;
      }
      await ctx.output.write({
        kind: "token.transfer.result",
        data: {
          signature: result.value.signature,
          mint,
          source,
          destination,
          amount: (amount as unknown as bigint).toString(),
          decimals,
          owner,
          intent: result.value.intent,
        },
        meta: { network: String(args.network) },
      });
    });
  },
});
