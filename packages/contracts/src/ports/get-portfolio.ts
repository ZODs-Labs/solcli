import type { Portfolio } from "../domain/portfolio.js";
import type { OwnerAddress } from "../domain/pubkey.js";
import type { PortCallOptions } from "./common.js";

export interface GetPortfolioPort {
  getPortfolio(owner: OwnerAddress, opts?: PortCallOptions): Promise<Portfolio>;
}
