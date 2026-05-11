import { deriveAtaAddress } from "./ata.js";
import { getTokenBalance } from "./balance.js";
import { buildTokenTransferMessage } from "./transfer.js";

export interface SplTokenProtocolPorts {
  readonly getTokenBalance: typeof getTokenBalance;
  readonly buildTokenTransferMessage: typeof buildTokenTransferMessage;
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
    buildTokenTransferMessage,
    deriveAtaAddress,
  },
  commands: ["token balance", "token transfer"],
};
