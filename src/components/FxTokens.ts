import { ethers } from "ethers";
import config, { FxTokenAddresses } from "../config";
import { ERC20, ERC20__factory } from "../types/abi";
import { FxTokenSymbol, FxTokenSymbolMap } from "../types/fxTokens";
import { getAvailableTokens } from "../utils/fxTokens";

export default class FxTokens {
  public contracts: FxTokenSymbolMap<ERC20>;
  public availableTokens: { symbol: FxTokenSymbol; address: string }[];

  constructor(private signer: ethers.Signer, addresses?: FxTokenAddresses) {
    const addressesToUse = addresses || config.fxTokenAddresses;
    this.contracts = this.createFxTokenContracts(addressesToUse);
    this.availableTokens = getAvailableTokens(addressesToUse);
  }

  private createFxTokenContracts = (addresses: FxTokenAddresses) => {
    return Object.keys(addresses).reduce((progress, key) => {
      const symbol = key as FxTokenSymbol;
      return {
        ...progress,
        [key]: ERC20__factory.connect(addresses[symbol], this.signer)
      };
    }, {} as FxTokenSymbolMap<ERC20>);
  };
}
