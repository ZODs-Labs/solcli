import type { Asset } from "../domain/asset.js";
import type { PaginatedResult, PaginationCursor } from "../domain/pagination.js";
import type { OwnerAddress } from "../domain/pubkey.js";
import type { PortCallOptions } from "./common.js";

export interface GetAssetsByOwnerPort {
  getAssetsByOwner(
    owner: OwnerAddress,
    page?: PaginationCursor,
    opts?: PortCallOptions,
  ): Promise<PaginatedResult<Asset>>;
}
