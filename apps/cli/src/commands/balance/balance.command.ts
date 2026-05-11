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
    name: "balance",
    description: "Read the native SOL balance for an owner address.",
  },
  args: {
    owner: {
      type: "positional",
      required: true,
      valueHint: "<base58-pubkey>",
      description: "Owner public key in base58",
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
      const lamports = await ctx.ops.getBalance(owner, {
        signal: ctx.abortController.signal,
      });
      const lamportsBig = lamports as unknown as bigint;
      await ctx.output.write({
        kind: "balance.native",
        data: {
          owner,
          lamports: lamportsBig.toString(),
          sol: lamportsToSolString(lamportsBig),
        },
        meta: { network: String(args.network) },
      });
    });
  },
});

function lamportsToSolString(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const frac = lamports % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
}
