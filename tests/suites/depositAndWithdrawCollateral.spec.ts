﻿import { xdescribe, it } from "@jest/globals";
import { SDK } from "../../src/types/SDK";
import { Vault } from "../../src/types/Vault";
import { fxTokens, CollateralTokens } from "../../src/types/ProtocolTokens";
import { ethers } from "ethers";
import { getSDK } from "../setupTests";

let sdk: SDK;
let vault: Vault;

const DEPOSIT_AMOUNT = ethers.BigNumber.from("1");
const GAS_LIMIT = ethers.BigNumber.from("2500000");

xdescribe("Vault: depositCollateral, withdrawCollateral", function () {
  beforeAll(async () => {
    sdk = getSDK();
    const account = await sdk.signer?.getAddress()!;
    vault = await Vault.from(account, fxTokens.fxAUD, sdk);
  });
  it("Should deposit eth", async () => {
    await (
      await vault.depositCollateral(DEPOSIT_AMOUNT, "ETH", false, GAS_LIMIT)
    ).wait(2);
  });
  it("Should deposit weth", async () => {
    await (
      await vault.depositCollateral(DEPOSIT_AMOUNT, CollateralTokens.WETH, false, GAS_LIMIT)
    ).wait(2);
  });
  it("Should deposit dai", async () => {
    await (
      await vault.depositCollateral(DEPOSIT_AMOUNT, CollateralTokens.DAI, false, GAS_LIMIT)
    ).wait(2);
  });
  it("Should withdraw eth", async () => {
    await (
      await vault.withdrawCollateral(DEPOSIT_AMOUNT, "ETH", false, GAS_LIMIT)
    ).wait(2);
  });
  it("Should withdraw weth", async () => {
    await (
      await vault.withdrawCollateral(DEPOSIT_AMOUNT, CollateralTokens.WETH, false, GAS_LIMIT)
    ).wait(2);
  });
  it("Should withdraw dai", async () => {
    await (
      await vault.withdrawCollateral(DEPOSIT_AMOUNT, CollateralTokens.DAI, false, GAS_LIMIT)
    ).wait(2);
  });
});
