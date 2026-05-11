import { defineCommand } from "citty";
import { withContext } from "../../context.js";

const TABLE = [
  { exit: 0, code: "", meaning: "Success" },
  { exit: 1, code: "SOLCLI_E_GENERIC", meaning: "Generic failure" },
  { exit: 2, code: "SOLCLI_E_USAGE", meaning: "Bad CLI args" },
  { exit: 10, code: "SOLCLI_E_CONFIG", meaning: "Config load/parse/write" },
  { exit: 11, code: "SOLCLI_E_SECRET", meaning: "Keychain/encrypted-file" },
  { exit: 12, code: "SOLCLI_E_NO_SIGNER", meaning: "(reserved for v1) Wallet/signer" },
  { exit: 20, code: "SOLCLI_E_RPC", meaning: "(reserved) RPC failure" },
  { exit: 21, code: "SOLCLI_E_RPC_RATELIMIT", meaning: "(reserved) RPC 429" },
  { exit: 22, code: "SOLCLI_E_BLOCKHASH_EXPIRED", meaning: "(reserved)" },
  { exit: 23, code: "SOLCLI_E_INSUFFICIENT_FUNDS", meaning: "(reserved)" },
  { exit: 24, code: "SOLCLI_E_SIM_FAILED", meaning: "(reserved)" },
  { exit: 30, code: "SOLCLI_E_PROVIDER", meaning: "(reserved) DataProvider failure" },
  {
    exit: 31,
    code: "SOLCLI_E_PROVIDER_CAPABILITY_UNSUPPORTED",
    meaning: "Active in v0 - no provider registered",
  },
  { exit: 40, code: "SOLCLI_E_NO_INPUT", meaning: "Prompt in non-interactive mode" },
  { exit: 69, code: "SOLCLI_E_EX_UNAVAILABLE", meaning: "Service unavailable (sysexits)" },
  { exit: 70, code: "SOLCLI_E_INTERNAL", meaning: "Uncaught error / bug" },
  { exit: 74, code: "SOLCLI_E_IO", meaning: "Filesystem error" },
  { exit: 130, code: "", meaning: "SIGINT (128 + 2)" },
  { exit: 143, code: "", meaning: "SIGTERM (128 + 15)" },
];

export default defineCommand({
  meta: { name: "exit-codes", description: "Show the stable exit code table" },
  async run() {
    return withContext(async (ctx) => ctx.output.write({ exitCodes: TABLE }));
  },
});
