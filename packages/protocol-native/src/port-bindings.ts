import { buildDelegateMessage, buildWithdrawMessage } from "./stake.js";
import { buildTransferMessage } from "./transfer.js";
import { readVoteInfo } from "./vote.js";

export interface NativeProtocolPorts {
  readonly buildTransferMessage: typeof buildTransferMessage;
  readonly buildDelegateMessage: typeof buildDelegateMessage;
  readonly buildWithdrawMessage: typeof buildWithdrawMessage;
  readonly readVoteInfo: typeof readVoteInfo;
}

export interface NativeProtocolBindings {
  readonly name: "@solcli/protocol-native";
  readonly ports: NativeProtocolPorts;
  readonly commands: readonly ["transfer", "stake", "balance", "account"];
}

export const NATIVE_PROTOCOL_BINDINGS: NativeProtocolBindings = {
  name: "@solcli/protocol-native",
  ports: {
    buildTransferMessage,
    buildDelegateMessage,
    buildWithdrawMessage,
    readVoteInfo,
  },
  commands: ["transfer", "stake", "balance", "account"],
};
