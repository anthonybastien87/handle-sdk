import { ethers } from "ethers";
import { Provider as MultiCallProvider, ContractCall } from "ethers-multicall";
import { FxTokenSymbol } from "../../types/fxTokens";
import { ProtocolAddresses, FxTokenAddresses, CollateralAddresses } from "../../config";
import { Handle, VaultLibrary } from "../../contracts";
import { getAvailableAddresses } from "../../utils/fxTokens";

import handleAbi from "../../abis/handle/Handle.json";
import vaultLibraryAbi from "../../abis/handle/VaultLibrary.json";
import { createMultiCallContract } from "../../utils/contracts";
import { Promisified } from "../../types/general";
import { CollateralSymbol, CollateralSymbolMap } from "../../types/collaterals";

export type VaultsConfig = {
  protocolAddress: ProtocolAddresses;
  fxTokenAddress: Partial<FxTokenAddresses>;
  collateralAddresses: Partial<CollateralAddresses>;
  chainId: number;
};

export type Vault = {
  fxToken: FxTokenSymbol;
  debt: ethers.BigNumber;
  totalCollateralBalanceAsEth: ethers.BigNumber;
  minimumRatio: ethers.BigNumber;
  liquidationFee: ethers.BigNumber;
  tokenPrice: ethers.BigNumber;
  debtAsEth: ethers.BigNumber;
  collateralRatio: ethers.BigNumber;
  isRedeemable: boolean;
  redeemableTokens: ethers.BigNumber;

  collateral: CollateralSymbolMap<ethers.BigNumber>;
};

type Contracts = {
  handle: Handle;
  vaultLibrary: VaultLibrary;
};

type VaultMultiCallRequestAndResponse = {
  debt: ethers.BigNumber;
  totalCollateralBalanceAsEth: ethers.BigNumber;
  minimumRatio: ethers.BigNumber;
  liquidationFee: ethers.BigNumber;
  tokenPrice: ethers.BigNumber;
};

const MULTICALL_KEY_OBJECT: { [key in keyof VaultMultiCallRequestAndResponse]: boolean } = {
  debt: true,
  totalCollateralBalanceAsEth: true,
  minimumRatio: true,
  liquidationFee: true,
  tokenPrice: true
};

export default class Vaults {
  public availableVaultTypes: FxTokenSymbol[];
  public availableCollateralTypes: {
    symbol: CollateralSymbol;
    address: string;
  }[];
  private multiCallProvider: MultiCallProvider;
  private multiCallContracts: Contracts;

  constructor(signer: ethers.Signer, private config: VaultsConfig) {
    this.availableVaultTypes = getAvailableAddresses(config.fxTokenAddress).map((t) => t.symbol);
    this.availableCollateralTypes = getAvailableAddresses(config.collateralAddresses);
    this.multiCallProvider = new MultiCallProvider(signer.provider!, config.chainId);
    this.multiCallContracts = {
      handle: createMultiCallContract<Handle>(config.protocolAddress.handle, handleAbi.abi),
      vaultLibrary: createMultiCallContract<VaultLibrary>(
        config.protocolAddress.vaultLibrary,
        vaultLibraryAbi.abi
      )
    };
  }

  public getAccountsVaults = async (account: string): Promise<Vault[]> => {
    const vaultCalls = this.availableVaultTypes
      .map((t) => this.getMultiCallsForVault(account, t))
      .reduce((progress, vaultCalls) => [...progress, ...vaultCalls]);

    const collateralCalls = this.availableVaultTypes
      .map((t) => this.getMultiCallsForVaultsCollateral(account, t))
      .reduce((progress, collateralCallsForVault) => [...progress, ...collateralCallsForVault]);

    const vaultMultiCallResponsePromise = this.multiCallProvider.all(vaultCalls);
    const collateralMultiCallResponsePromise = this.multiCallProvider.all(collateralCalls);

    const [vaultMultiCallResponse, collateralMultiCallResponse] = await Promise.all([
      vaultMultiCallResponsePromise,
      collateralMultiCallResponsePromise
    ]);

    const rawVaultData = this.multiCallVaultResponseToTypedObject(vaultMultiCallResponse);
    const rawVaultsCollateralData = this.multiCallVaultsCollateralResponseToTypedObject(
      collateralMultiCallResponse
    );

    return rawVaultData.map((v, index) =>
      this.rawDataToVault(this.availableVaultTypes[index], v, rawVaultsCollateralData[index])
    );
  };

  public getVault = async (account: string, fxToken: FxTokenSymbol): Promise<Vault> => {
    const vaultCalls = this.getMultiCallsForVault(account, fxToken);
    const collateralCalls = this.getMultiCallsForVaultsCollateral(account, fxToken);

    const vaultMultiCallResponsePromise = this.multiCallProvider.all(vaultCalls);
    const collateralMultiCallResponsePromise = this.multiCallProvider.all(collateralCalls);

    const [vaultMultiCallResponse, collateralMultiCallResponse] = await Promise.all([
      vaultMultiCallResponsePromise,
      collateralMultiCallResponsePromise
    ]);

    const rawVaultData = this.multiCallVaultResponseToTypedObject(vaultMultiCallResponse)[0];
    const rawVaultsCollateralData = this.multiCallVaultsCollateralResponseToTypedObject(
      collateralMultiCallResponse
    )[0];

    return this.rawDataToVault(fxToken, rawVaultData, rawVaultsCollateralData);
  };

  private rawDataToVault = (
    fxToken: FxTokenSymbol,
    vaultData: VaultMultiCallRequestAndResponse,
    collateralData: CollateralSymbolMap<ethers.BigNumber>
  ): Vault => {
    const { debt, totalCollateralBalanceAsEth, minimumRatio, liquidationFee, tokenPrice } =
      vaultData;

    const debtAsEth = debt.mul(tokenPrice).div(ethers.constants.WeiPerEther);

    const collateralRatio = debt.gt(0)
      ? totalCollateralBalanceAsEth.mul(ethers.constants.WeiPerEther).div(debtAsEth)
      : ethers.constants.Zero;

    const isRedeemable =
      collateralRatio.lt(minimumRatio) &&
      collateralRatio.gte(ethers.constants.WeiPerEther) &&
      totalCollateralBalanceAsEth.gt(ethers.constants.Zero) &&
      debt.gt(ethers.constants.Zero);

    const redeemableAsEth = isRedeemable
      ? this.calculateTokensRequiredForCrIncrease(
          minimumRatio,
          debtAsEth,
          totalCollateralBalanceAsEth,
          ethers.constants.WeiPerEther
        )
      : ethers.constants.Zero;

    const redeemableTokensTemp = isRedeemable
      ? redeemableAsEth.mul(ethers.constants.WeiPerEther).div(tokenPrice)
      : ethers.constants.Zero;

    const redeemableTokens = redeemableTokensTemp.gt(debt) ? debt : redeemableTokensTemp;

    return {
      fxToken,
      debt,
      totalCollateralBalanceAsEth,
      minimumRatio,
      liquidationFee,
      tokenPrice,
      debtAsEth,
      collateralRatio,
      isRedeemable,
      redeemableTokens,
      collateral: collateralData
    };
  };

  private getMultiCallsForVault = (account: string, fxToken: FxTokenSymbol): ContractCall[] => {
    const tokenAddress = this.config.fxTokenAddress[fxToken];

    if (!tokenAddress) {
      throw new Error(`Vaults not initialised with fxToken that matches: ${fxToken}`);
    }

    const calls: Promisified<VaultMultiCallRequestAndResponse> = {
      debt: this.multiCallContracts.handle.getDebt(account, tokenAddress),
      totalCollateralBalanceAsEth:
        this.multiCallContracts.vaultLibrary.getTotalCollateralBalanceAsEth(account, tokenAddress),
      minimumRatio: this.multiCallContracts.vaultLibrary.getMinimumRatio(account, tokenAddress),
      liquidationFee: this.multiCallContracts.vaultLibrary.getLiquidationFee(account, tokenAddress),
      tokenPrice: this.multiCallContracts.handle.getTokenPrice(tokenAddress)
    };

    return Object.keys(MULTICALL_KEY_OBJECT).map(
      (key) => calls[key as keyof VaultMultiCallRequestAndResponse]
    ) as unknown as ContractCall[];
  };

  private multiCallVaultResponseToTypedObject = (results: any[]) => {
    const properties = Object.keys(
      MULTICALL_KEY_OBJECT
    ) as unknown as (keyof VaultMultiCallRequestAndResponse)[];

    const vaultData: VaultMultiCallRequestAndResponse[] = [];

    while (results.length > 0) {
      const data = results.splice(0, properties.length);

      const newVaultData = properties.reduce((progress, key, index) => {
        return {
          ...progress,
          [key]: data[index]
        };
      }, {} as VaultMultiCallRequestAndResponse);

      vaultData.push(newVaultData);
    }

    return vaultData;
  };

  private getMultiCallsForVaultsCollateral = (account: string, fxToken: FxTokenSymbol) => {
    const tokenAddress = this.config.fxTokenAddress[fxToken];

    if (!tokenAddress) {
      throw new Error(`Vaults not initialised with fxToken that matches: ${fxToken}`);
    }

    return this.availableCollateralTypes.map((c) => {
      return this.multiCallContracts.handle.getCollateralBalance(account, c.address, tokenAddress);
    }) as unknown as ContractCall[];
  };

  private multiCallVaultsCollateralResponseToTypedObject = (results: any[]) => {
    const collateralDataByVault: CollateralSymbolMap<ethers.BigNumber>[] = [];

    while (results.length > 0) {
      const data = results.splice(0, this.availableCollateralTypes.length);

      const newVaultData = data.reduce((progress, value, index) => {
        return {
          ...progress,
          [this.availableCollateralTypes[index].symbol]: value
        };
      }, {} as VaultMultiCallRequestAndResponse);

      collateralDataByVault.push(newVaultData);
    }

    return collateralDataByVault;
  };

  private calculateTokensRequiredForCrIncrease(
    crTarget: ethers.BigNumber,
    debtAsEther: ethers.BigNumber,
    collateralAsEther: ethers.BigNumber,
    collateralReturnRatio: ethers.BigNumber
  ) {
    const nominator = crTarget
      .mul(debtAsEther)
      .sub(collateralAsEther.mul(ethers.constants.WeiPerEther));
    const denominator = crTarget.sub(collateralReturnRatio);
    return nominator.div(denominator);
  }
}
