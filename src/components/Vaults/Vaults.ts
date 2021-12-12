import { ethers } from "ethers";
import { FxTokenSymbol } from "../../types/fxTokens";
import { ProtocolAddresses, FxTokenAddresses } from "../../config";
import { Handle, Handle__factory, VaultLibrary, VaultLibrary__factory } from "../../types/abi";
import { getAvailableTokens } from "../../utils/fxTokens";

export type VaultsConfig = {
  protocol: ProtocolAddresses;
  fxTokenAddress: FxTokenAddresses;
};

export type Vault = {
  fxToken: FxTokenSymbol;
  debt: ethers.BigNumber;
  totalCollateralBalanceAsEth: ethers.BigNumber;
  minimumRatio: ethers.BigNumber;
};

export default class Vaults {
  public availableVaultTypes: FxTokenSymbol[];

  private contracts: {
    handle: Handle;
    vaultLibrary: VaultLibrary;
  };
  constructor(signer: ethers.Signer, private config: VaultsConfig) {
    this.availableVaultTypes = getAvailableTokens(config.fxTokenAddress).map((t) => t.symbol);
    this.contracts = {
      handle: Handle__factory.connect(config.protocol.handle, signer),
      vaultLibrary: VaultLibrary__factory.connect(config.protocol.vaultLibrary, signer)
    };
  }

  public getAccountsVaults = async (account: string): Promise<Vault[]> =>
    Promise.all([...this.availableVaultTypes.map((t) => this.getVault(account, t))]);

  public getVault = async (account: string, fxToken: FxTokenSymbol): Promise<Vault> => {
    const tokenAddress = this.config.fxTokenAddress[fxToken];

    const [debt, totalCollateralBalanceAsEth, minimumRatio] = await Promise.all([
      this.contracts.handle.getDebt(account, tokenAddress),
      this.contracts.vaultLibrary.getTotalCollateralBalanceAsEth(account, tokenAddress),
      this.contracts.vaultLibrary.getMinimumRatio(account, tokenAddress)
    ]);

    return {
      fxToken,
      debt,
      totalCollateralBalanceAsEth,
      minimumRatio
    };
  };
}
