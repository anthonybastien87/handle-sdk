import { ethers } from "ethers";
import {CollateralToken} from "./CollateralToken";

/**
 * Class to interact with a fxKeeperPool for a specific fxToken.
 * The fxKeeperPool is a single contract, but each function requires an
 * input fxToken to perform the action for. This class fills the fxToken
 * parameters with the instance token.
 */
export class fxKeeperPool {
  public token: string;
  private contract: ethers.Contract;
  public gasLimit: ethers.BigNumber;

  /**
   * @param token The pool fxToken address.
   * @param contract The keeper pool contract instance.
   */
  public constructor(token: string, contract: ethers.Contract) {
    this.token = token;
    this.contract = contract;
    this.gasLimit = ethers.BigNumber.from("750000");
  }
  
  public async stake(amount: ethers.BigNumber) {
    if (amount.lt(0))
      throw new Error("Amount must be greater than 0");
    return await this.contract.stake(amount, this.token, {
      gasLimit: this.gasLimit
    });
  }
  
  public async unstake(amount: ethers.BigNumber) {
    if (amount.lt(0))
      throw new Error("Amount must be greater than 0");
    return await this.contract.unstake(amount, this.token, {
      gasLimit: this.gasLimit
    });
  }
  
  public async withdrawCollateralReward() {
    return await this.contract.withdrawCollateralReward(this.token, {
      gasLimit: this.gasLimit
    });
  }
  
  public async balanceOfStake(account: string): Promise<ethers.BigNumber> {
    return await this.contract.balanceOfStake(account, this.token);
  }
  
  public async balanceOfRewards(account: string): Promise<ethers.BigNumber> {
    return await this.contract.balanceOfRewards(account, this.token);
  }
  
  public async shareOf(account: string): Promise<ethers.BigNumber> {
    return await this.contract.shareOf(account, this.token);
  }
  
  public async liquidate(account: string) {
    return await this.contract.liquidate(account, this.token, {
      gasLimit: this.gasLimit
    });
  }
  
  public async getPoolCollateralBalance(collateral: CollateralToken): Promise<ethers.BigNumber> {
    return await this.contract.getPoolCollateralBalance(
      this.token,
      collateral.address
    );
  }
  
  public async getPoolTotalDeposit() {
    return await this.contract.getPoolTotalDeposit(this.token);
  }
}
