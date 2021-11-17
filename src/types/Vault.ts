﻿import { fxToken } from "./fxToken";
import { ethers } from "ethers";
import { VaultCollateral } from "./VaultCollateral";
import { SDK } from "./SDK";
import { IndexedVaultData, queryVaults } from "../readers/vault";
import { CollateralTokens, fxTokens } from "./ProtocolTokens";
import { tokenAddressToFxToken } from "./utils";

const oneEth = ethers.utils.parseEther("1");

// TODO: A WebSocket connection to the graph node must be maintained so that whenever
// a vault instance has a state change it can be properly updated.
export class Vault {
  private sdk: SDK;
  /** Address for the owner of the vault */
  public account: string;
  public token: fxToken;
  public debt: ethers.BigNumber;
  public debtAsEth: ethers.BigNumber;
  public collateral: VaultCollateral[];
  public collateralAsEth: ethers.BigNumber;
  public freeCollateralAsEth: ethers.BigNumber;
  public redeemableTokens: ethers.BigNumber;
  public ratios: {
    current: ethers.BigNumber;
    minting: ethers.BigNumber;
    /** Always 80% of the minting ratio, or the minimum possible value of 110% */
    liquidation: ethers.BigNumber;
  };
  public collateralRatio: ethers.BigNumber;
  public minimumRatio: ethers.BigNumber;
  public isRedeemable: boolean;
  public isLiquidatable: boolean;
  public liquidationFee: ethers.BigNumber;

  constructor(account: string, token: fxTokens, sdk: SDK) {
    const fxToken = sdk.protocol.getFxTokenBySymbol(token);
    if (!fxToken) throw new Error(`Invalid fxToken address provided "${token}"`);
    this.sdk = sdk;
    this.token = fxToken;
    this.account = account;
    this.debt = ethers.constants.Zero;
    this.debtAsEth = ethers.constants.Zero;
    this.collateral = [];
    this.collateralAsEth = ethers.constants.Zero;
    this.freeCollateralAsEth = ethers.constants.Zero;
    this.redeemableTokens = ethers.constants.Zero;
    this.collateralRatio = ethers.constants.Zero;
    this.minimumRatio = ethers.constants.Zero;
    this.isRedeemable = false;
    this.isLiquidatable = false;
    this.ratios = {
      current: ethers.constants.Zero,
      minting: ethers.constants.Zero,
      liquidation: ethers.constants.Zero
    };
    this.liquidationFee = ethers.constants.Zero;
  }

  public static async query(sdk: SDK, filter: any): Promise<Vault[]> {
    const vaultData = await queryVaults(sdk.gqlClient, filter);

    return indexedVaultDataToVaults(vaultData, sdk);
  }

  public static async getUsersVaults(account: string, sdk: SDK): Promise<Vault[]> {
    const vaultData = await queryVaults(sdk.gqlClient, {
      where: {
        account: account.toLowerCase()
      }
    });

    return indexedVaultDataToVaults(vaultData, sdk);
  }

  public static async from(account: string, token: fxTokens, sdk: SDK): Promise<Vault> {
    const vault = new Vault(account, token, sdk);
    await vault.update();
    return vault;
  }

  public async update(vaultData?: IndexedVaultData) {
    const data =
      vaultData ||
      (
        await queryVaults(this.sdk.gqlClient, {
          where: {
            account: this.account,
            fxToken: this.token.address
          }
        })
      )[0];

    if (data == null) return;

    // Update debt.
    this.debt = data.debt;
    this.debtAsEth = this.debt.mul(this.token.rate).div(ethers.constants.WeiPerEther);
    // Update collateral tokens.
    this.collateral = [];
    this.collateralAsEth = ethers.BigNumber.from(0);
    this.redeemableTokens = data.redeemableTokens;
    for (let token of data.collateralTokens) {
      const collateralToken = this.sdk.protocol.getCollateralTokenByAddress(token.address);
      this.collateral.push({
        token: collateralToken,
        amount: token.amount
      });
    }
    this.collateralAsEth = data.collateralAsEther;
    this.collateralRatio = data.collateralRatio;
    this.minimumRatio = data.minimumRatio;
    this.isRedeemable = data.isRedeemable;
    this.isLiquidatable = data.isLiquidatable;
    if (this.collateralAsEth.eq(0)) return;
    this.freeCollateralAsEth = this.collateralAsEth.sub(
      this.debtAsEth.mul(this.minimumRatio).div(ethers.constants.WeiPerEther)
    );
    // TODO: calculate collateral shares locally to remove contract calls
    this.liquidationFee = await this.sdk.contracts.vaultLibrary.getLiquidationFee(
      this.account,
      this.token.address
    );
    // Set minting ratio.
    this.ratios.minting = await this.sdk.contracts.vaultLibrary.getMinimumRatio(
      this.account,
      this.token.address
    );
    // Set current and liquidation ratios.
    this.ratios.current = this.debtAsEth.gt(0)
      ? this.collateralAsEth.mul(ethers.constants.WeiPerEther).div(this.debtAsEth)
      : ethers.constants.Zero;
    this.ratios.liquidation = this.ratios.minting.mul("80").div("100");
    const minLiquidationRatio = ethers.utils.parseEther("1.1");
    if (this.ratios.liquidation.lt(minLiquidationRatio))
      this.ratios.liquidation = minLiquidationRatio;
  }

  private calculateTokensRequiredForCrIncrease(
    crTarget: ethers.BigNumber,
    debtAsEther: ethers.BigNumber,
    collateralAsEther: ethers.BigNumber,
    collateralReturnRatio: ethers.BigNumber
  ) {
    const nominator = crTarget.mul(debtAsEther).sub(collateralAsEther.mul(oneEth));
    const denominator = crTarget.sub(collateralReturnRatio);
    return nominator.div(denominator);
  }

  public async updateFromChain() {
    const promises = [];

    // Get debt.
    promises.push(
      new Promise<void>(async (resolve) => {
        this.debt = await this.sdk.contracts.handle.getDebt(this.account, this.token.address);
        resolve();
      })
    );

    // Get total collateral
    promises.push(
      new Promise<void>(async (resolve) => {
        this.collateralAsEth = await this.sdk.contracts.vaultLibrary.getTotalCollateralBalanceAsEth(
          this.account,
          this.token.address
        );
        resolve();
      })
    );

    // Get min CR
    promises.push(
      new Promise<void>(async (resolve) => {
        this.minimumRatio = this.ratios.minting =
          await this.sdk.contracts.vaultLibrary.getMinimumRatio(this.account, this.token.address);
        resolve();
      })
    );

    // Get liquidation fee
    promises.push(
      new Promise<void>(async (resolve) => {
        this.liquidationFee = await this.sdk.contracts.vaultLibrary.getLiquidationFee(
          this.account,
          this.token.address
        );
        resolve();
      })
    );

    // Get token price
    let tokenPrice = ethers.constants.Zero;
    promises.push(
      new Promise<void>(async (resolve) => {
        tokenPrice = await this.sdk.contracts.handle.getTokenPrice(this.token.address);
        resolve();
      })
    );

    // Update collateral tokens.
    this.collateral = [];

    for (let coll of this.sdk.protocol.collateralTokens) {
      promises.push(
        new Promise<void>(async (resolve) => {
          const collateralAmount = await this.sdk.contracts.handle.getCollateralBalance(
            this.account,
            coll.address,
            this.token.address
          );

          this.collateral.push({
            token: coll,
            amount: collateralAmount
          });

          resolve();
        })
      );
    }

    await Promise.all(promises);

    // Update debt as ETH
    this.debtAsEth = this.debt.mul(this.token.rate).div(ethers.constants.WeiPerEther);

    // Get CR
    this.collateralRatio = this.debtAsEth.gt(0)
      ? this.collateralAsEth.mul(oneEth).div(this.debtAsEth)
      : ethers.constants.Zero;

    // Determine if redeemable
    this.isRedeemable =
      this.collateralRatio.lt(this.minimumRatio) &&
      this.collateralRatio.gte(oneEth) &&
      this.collateralAsEth.gt(ethers.constants.Zero) &&
      this.debt.gt(ethers.constants.Zero);

    if (this.isRedeemable) {
      const redeemableAsEth = this.calculateTokensRequiredForCrIncrease(
        this.minimumRatio,
        this.debtAsEth,
        this.collateralAsEth,
        oneEth
      );

      this.redeemableTokens = this.isRedeemable
        ? redeemableAsEth.mul(oneEth).div(tokenPrice)
        : ethers.constants.Zero;

      if (this.redeemableTokens.gt(this.debt)) this.redeemableTokens = this.debt;
    } else if (this.redeemableTokens.gt(ethers.constants.Zero))
      this.redeemableTokens = ethers.constants.Zero;

    // Determine if liquidatable
    const liquidationRatio = this.ratios.minting.mul("80").div("100");
    this.isLiquidatable = this.isRedeemable && this.collateralRatio.lt(liquidationRatio);

    // If no collateral, no need to set/update the below
    if (this.collateralAsEth.eq(0)) return;

    // Calculate free collateral
    this.freeCollateralAsEth = this.collateralAsEth.sub(
      this.debtAsEth.mul(this.minimumRatio).div(ethers.constants.WeiPerEther)
    );

    // Set current and liquidation ratios.
    this.ratios.current = this.collateralRatio;
    const minLiquidationRatio = ethers.utils.parseEther("1.1");
    if (this.ratios.liquidation.lt(minLiquidationRatio))
      this.ratios.liquidation = minLiquidationRatio;
    console.log("Liquidation:", ethers.utils.formatEther(this.ratios.liquidation));
  }

  /** Mints using Ether as collateral */
  public async mintWithEth(
    tokenAmount: ethers.BigNumber,
    etherAmount: ethers.BigNumber,
    returnTxData: boolean = false,
    gasLimit?: ethers.BigNumber,
    gasPrice?: ethers.BigNumber,
    deadline?: number,
    referral?: string
  ) {
    if (!this.sdk.signer) throw new Error("This function requires a signer");
    const func = !returnTxData
      ? this.sdk.contracts.comptroller
      : this.sdk.contracts.comptroller.populateTransaction;
    return await func.mintWithEth(
      tokenAmount,
      this.token.address,
      getDeadline(deadline),
      referral ?? ethers.constants.AddressZero,
      {
        value: etherAmount,
        gasPrice: gasPrice,
        gasLimit: gasLimit
      }
    );
  }

  /** Mints using an ERC20 as collateral */
  public async mint(
    tokenAmount: ethers.BigNumber,
    collateralToken: CollateralTokens,
    collateralAmount: ethers.BigNumber,
    returnTxData: boolean = false,
    gasLimit?: ethers.BigNumber,
    gasPrice?: ethers.BigNumber,
    deadline?: number,
    referral?: string
  ) {
    if (!this.sdk.signer) throw new Error("This function requires a signer");
    const func = !returnTxData
      ? this.sdk.contracts.comptroller
      : this.sdk.contracts.comptroller.populateTransaction;
    const collateralTokenAddress =
      this.sdk.protocol.getCollateralTokenBySymbol(collateralToken).address;
    return await func.mint(
      tokenAmount,
      this.token.address,
      collateralTokenAddress,
      collateralAmount,
      getDeadline(deadline),
      referral ?? ethers.constants.AddressZero,
      {
        gasPrice: gasPrice,
        gasLimit: gasLimit
      }
    );
  }

  /** Mints with existing vault collateral */
  public async mintWithoutCollateral(
    tokenAmount: ethers.BigNumber,
    returnTxData: boolean = false,
    gasLimit?: ethers.BigNumber,
    gasPrice?: ethers.BigNumber,
    deadline?: number,
    referral?: string
  ) {
    if (!this.sdk.signer) throw new Error("This function requires a signer");
    const func = !returnTxData
      ? this.sdk.contracts.comptroller
      : this.sdk.contracts.comptroller.populateTransaction;
    return await func.mintWithoutCollateral(
      tokenAmount,
      this.token.address,
      getDeadline(deadline),
      referral ?? ethers.constants.AddressZero,
      {
        gasPrice: gasPrice,
        gasLimit: gasLimit
      }
    );
  }

  public async depositCollateral(
    amount: ethers.BigNumber,
    collateralToken: CollateralTokens | "ETH",
    returnTxData: boolean = false,
    gasLimit?: ethers.BigNumber,
    gasPrice?: ethers.BigNumber,
    referral?: string
  ) {
    if (!this.sdk.signer) throw new Error("This function requires a signer");

    const func = !returnTxData
      ? this.sdk.contracts.treasury
      : this.sdk.contracts.treasury.populateTransaction;

    if (collateralToken === "ETH") {
      return await func.depositCollateralETH(
        this.account,
        this.token.address,
        referral ?? ethers.constants.AddressZero,
        {
          value: amount,
          gasPrice: gasPrice,
          gasLimit: gasLimit
        }
      );
    }

    const collateral = this.sdk.contracts[collateralToken];
    const allowance = await collateral.allowance(this.account, this.sdk.contracts.treasury.address);

    if (allowance.lt(amount)) {
      await (await collateral.approve(this.sdk.contracts.treasury.address, amount)).wait(2);
    }

    return await func.depositCollateral(
      this.account,
      amount,
      collateral.address,
      this.token.address,
      referral ?? ethers.constants.AddressZero,
      {
        gasPrice: gasPrice,
        gasLimit: gasLimit
      }
    );
  }

  public async withdrawCollateral(
    amount: ethers.BigNumber,
    collateralToken: CollateralTokens | "ETH",
    returnTxData: boolean = false,
    gasLimit?: ethers.BigNumber,
    gasPrice?: ethers.BigNumber
  ) {
    if (!this.sdk.signer) throw new Error("This function requires a signer");

    const func = !returnTxData
      ? this.sdk.contracts.treasury
      : this.sdk.contracts.treasury.populateTransaction;

    if (collateralToken === "ETH") {
      return await func.withdrawCollateralETH(this.account, amount, this.token.address, {
        gasPrice: gasPrice,
        gasLimit: gasLimit
      });
    }
    const collateralTokenAddress =
      this.sdk.protocol.getCollateralTokenBySymbol(collateralToken).address;

    return await func.withdrawCollateral(
      collateralTokenAddress,
      this.account,
      amount,
      this.token.address,
      {
        gasPrice: gasPrice,
        gasLimit: gasLimit
      }
    );
  }

  public static async redeem(
    fxToken: fxTokens,
    amount: ethers.BigNumber,
    sdk: SDK,
    referral?: string,
    returnTxData: boolean = false,
    deadline?: number
  ) {
    const accounts: string[] = (await Vault.getRedeemableVaultsForAmount(fxToken, amount, sdk)).map(
      (vault) => vault.account
    );
    if (accounts.length == 0) throw new Error("No vaults available for redemption");
    // @ts-ignore
    const func: ethers.Contract = !returnTxData
      ? sdk.contracts.liquidator
      : sdk.contracts.liquidator.populateTransaction;
    return await func.buyCollateralFromManyVaults(
      amount,
      sdk.protocol.getFxTokenAddress(fxToken),
      accounts,
      getDeadline(deadline),
      referral ?? ethers.constants.AddressZero
    );
  }

  /**
   * Finds an array of redeemable vaults which may be used to redeem up to
   * the redeemableAmount input provided.
   * @param fxToken The vault fxToken
   * @param redeemableAmount The amount to redeem
   * @param sdk The SDK instance
   * @param maxSearchCount The max. number of vaults to find for redemption
   */
  public static async getRedeemableVaultsForAmount(
    fxToken: fxTokens,
    redeemableAmount: ethers.BigNumber,
    sdk: SDK,
    maxSearchCount: number = 100
  ): Promise<Vault[]> {
    const vaults: Vault[] = await Vault.query(sdk, {
      first: maxSearchCount,
      orderBy: "redeemableTokens",
      orderDirection: "desc",
      where: {
        fxToken: sdk.protocol.getFxTokenAddress(fxToken),
        isRedeemable: true
      }
    });
    let redeemableCount = ethers.constants.Zero;
    let redeemableVaults = [];
    for (let vault of vaults) {
      redeemableCount = redeemableCount.add(vault.redeemableTokens);
      redeemableVaults.push(vault);
      if (redeemableCount.gte(redeemableAmount)) break;
    }
    return redeemableVaults;
  }

  public async burn(
    amount: ethers.BigNumber,
    returnTxData: boolean = false,
    gasLimit?: ethers.BigNumber,
    gasPrice?: ethers.BigNumber,
    deadline?: number
  ) {
    if (!this.sdk.signer) throw new Error("This function requires a signer");

    const func = !returnTxData
      ? this.sdk.contracts.comptroller
      : this.sdk.contracts.comptroller.populateTransaction;

    return await func.burn(amount, this.token.address, getDeadline(deadline), {
      gasPrice,
      gasLimit
    });
  }
}

const indexedVaultDataToVaults = async (vaultData: IndexedVaultData[], sdk: SDK) => {
  const vaults = [];

  for (const data of vaultData) {
    const vault = new Vault(data.account, tokenAddressToFxToken(data.fxToken, sdk), sdk);
    await vault.update(data);
    vaults.push(vault);
  }

  return vaults;
};

const getDeadline = (deadline?: number) => deadline ?? Math.floor(Date.now() / 1000) + 300;
