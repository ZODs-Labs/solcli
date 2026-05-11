/** Solana RPC client. v0 ships interface only; concrete impl arrives with Solana phase. */
export interface RpcClient {
  readonly endpoint: string;
}
