/** Cryptographic signer abstraction. v0 ships interface only. */
export interface Signer {
  readonly publicKey: string;
  sign(message: Uint8Array): Promise<Uint8Array>;
  readonly canSign: boolean;
}

export type SignerSource =
  | { kind: "file"; path: string }
  | { kind: "env"; varName: string }
  | { kind: "none" };
