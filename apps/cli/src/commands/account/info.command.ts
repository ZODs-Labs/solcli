import type { Pubkey } from "@solcli/contracts";
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
      const address = brandPubkey(ctx, String(args.address));
      const port = resolvePort(ctx.providers, "getAccountInfo").port;
      const info = await port.getAccountInfo(address, {
        signal: ctx.abortController.signal,
      });

      if (info === null) {
        await ctx.output.write({
          kind: "account.info",
          data: { address, exists: false },
          meta: { network: String(args.network) },
        });
        return;
      }

      await ctx.output.write({
        kind: "account.info",
        data: {
          address,
          exists: true,
          owner: info.owner,
          lamports: (info.lamports as unknown as bigint).toString(),
          executable: info.executable,
          dataLen: info.data.length,
          ...(info.rentEpoch !== undefined ? { rentEpoch: info.rentEpoch.toString() } : {}),
        },
        meta: { network: String(args.network) },
      });
    });
  },
});
