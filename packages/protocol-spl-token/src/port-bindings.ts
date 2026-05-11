import { deriveAtaAddress } from "./ata.js";
import { getTokenBalance } from "./balance.js";
import { buildTokenTransferPlan } from "./transfer.js";

export interface SplTokenProtocolPorts {
  readonly getTokenBalance: typeof getTokenBalance;
  readonly buildTokenTransferPlan: typeof buildTokenTransferPlan;
  readonly deriveAtaAddress: typeof deriveAtaAddress;
}

export interface SplTokenProtocolBindings {
  readonly name: "@solcli/protocol-spl-token";
  readonly ports: SplTokenProtocolPorts;
  readonly commands: readonly ["token balance", "token transfer"];
}

export const SPL_TOKEN_PROTOCOL_BINDINGS: SplTokenProtocolBindings = {
  name: "@solcli/protocol-spl-token",
  ports: {
    getTokenBalance,
    buildTokenTransferPlan,
    deriveAtaAddress,
  },
  commands: ["token balance", "token transfer"],
};
