import type { OwnerAddress, Pubkey } from "@solcli/contracts";
import { defineCommand } from "citty";
import { type Context, withContext } from "../../context.js";
import { resolvePort } from "../../operations/resolve-port.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_RE = new RegExp(`^[${BASE58_ALPHABET}]{32,44}$`);

function brandPubkey(ctx: Context, value: string): Pubkey {
  if (!BASE58_RE.test(value)) {
    throw ctx.errors.validation("Invalid pubkey: expected base58 32-44 chars", {
      details: { value, length: value.length },
    });
  }
  return value as Pubkey;
}

export default defineCommand({
  meta: {
    name: "balance",
    description: "List SPL token balances for an owner address.",
  },
  args: {
    owner: {
      type: "positional",
      required: true,
      valueHint: "<base58-pubkey>",
      description: "Owner public key in base58",
    },
    mint: {
      type: "string",
      required: false,
      valueHint: "<base58-pubkey>",
      description: "Filter to a single mint (optional)",
    },
    network: {
      type: "string",
      default: "devnet",
      description: "Network selector (devnet / testnet / mainnet-beta).",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const owner = brandPubkey(ctx, String(args.owner)) as unknown as OwnerAddress;
      const mintFilter = args.mint ? brandPubkey(ctx, String(args.mint)) : undefined;

      const port = resolvePort(ctx.providers, "getTokenBalances").port;
      const balances = await port.getTokenBalances(owner, {
        signal: ctx.abortController.signal,
      });

      const filtered = mintFilter
        ? balances.filter((b) => (b.mint as unknown as string) === (mintFilter as string))
        : balances;

      const records = filtered.map((b) => ({
        mint: b.mint,
        account: b.account,
        amount: (b.amount as unknown as bigint).toString(),
        decimals: b.decimals,
        uiAmount: b.uiAmount,
        ...(b.metadata ? { metadata: b.metadata } : {}),
      }));

      await ctx.output.write({
        kind: "token.balance",
        data: {
          owner,
          records,
        },
        meta: {
          network: String(args.network),
          ...(mintFilter !== undefined ? { mintFilter } : {}),
        },
      });
    });
  },
});
