import type { MintAddress, OwnerAddress } from "./pubkey.js";

export type AssetInterface =
  | "V1_NFT"
  | "V1_PRINT"
  | "PROGRAMMABLE_NFT"
  | "FUNGIBLE"
  | "MPL_CORE_ASSET"
  | "UNKNOWN";

export interface AssetCreator {
  readonly address: OwnerAddress;
  readonly share: number;
  readonly verified: boolean;
}

export interface AssetCompression {
  readonly compressed: boolean;
  readonly tree?: string;
  readonly leafId?: number;
}

export interface Asset {
  readonly id: MintAddress;
  readonly interface: AssetInterface;
  readonly name?: string;
  readonly symbol?: string;
  readonly description?: string;
  readonly imageUri?: string;
  readonly owner?: OwnerAddress;
  readonly collection?: MintAddress;
  readonly creators?: readonly AssetCreator[];
  readonly compression?: AssetCompression;
  readonly royalty?: { readonly basisPoints: number; readonly recipient?: OwnerAddress };
}
