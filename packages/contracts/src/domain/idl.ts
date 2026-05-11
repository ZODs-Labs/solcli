export interface AnchorIdlArg {
  readonly name: string;
  readonly type: unknown;
}

export interface AnchorIdlAccountMeta {
  readonly name: string;
  readonly writable?: boolean;
  readonly signer?: boolean;
}

export interface AnchorIdlInstruction {
  readonly name: string;
  readonly accounts: readonly AnchorIdlAccountMeta[];
  readonly args: readonly AnchorIdlArg[];
}

export interface AnchorIdlMetadata {
  readonly name: string;
  readonly version: string;
  readonly spec: string;
}

export interface AnchorIdl {
  readonly address?: string;
  readonly metadata: AnchorIdlMetadata;
  readonly instructions: readonly AnchorIdlInstruction[];
  readonly accounts?: readonly unknown[];
  readonly types?: readonly unknown[];
}
