import type { OwnerAddress, Pubkey } from "@solcli/contracts";
import { defineCommand } from "citty";
import { type Context, withContext } from "../../context.js";

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
    name: "info",
    description: "Read on-chain summary information for an account.",
  },
  args: {
    address: {
      type: "positional",
      required: true,
      valueHint: "<base58-pubkey>",
      description: "Account public key in base58",
    },
    network: {
      type: "string",
      default: "devnet",
      description: "Network selector (devnet / testnet / mainnet-beta).",
    },
  },
  async run({ args }) {
    return withContext(async (ctx) => {
      const owner = brandPubkey(ctx, String(args.address)) as unknown as OwnerAddress;
      // TODO: wiring -- swap ctx.ops.getBalance for ctx.ports.getAccountInfo
      // once the GetAccountInfo port lands and is registered.
      const lamports = await ctx.ops.getBalance(owner, {
        signal: ctx.abortController.signal,
      });
      await ctx.output.write({
        kind: "account.info",
        data: {
          address: owner,
          lamports: (lamports as unknown as bigint).toString(),
          // TODO: wiring -- include owner, executable, dataLen, rentEpoch.
        },
        meta: { network: String(args.network) },
      });
    });
  },
});
