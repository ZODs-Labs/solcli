import { buildDelegatePlan, buildWithdrawPlan } from "./stake.js";
import { buildTransferPlan } from "./transfer.js";
import { readVoteInfo } from "./vote.js";

export interface NativeProtocolPorts {
  readonly buildTransferPlan: typeof buildTransferPlan;
  readonly buildDelegatePlan: typeof buildDelegatePlan;
  readonly buildWithdrawPlan: typeof buildWithdrawPlan;
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
    buildTransferPlan,
    buildDelegatePlan,
    buildWithdrawPlan,
    readVoteInfo,
  },
  commands: ["transfer", "stake", "balance", "account"],
};
