import { ethers } from "ethers";
import Vaults, { VaultsConfig } from "./Vaults";
import sdkConfig from "../../config";

// vaults are only supported on arbitrum
export default class VaultsWithConfig extends Vaults {
  constructor(signer: ethers.Signer, config?: VaultsConfig) {
    super(
      signer,
      config || {
        protocol: sdkConfig.byNetwork.arbitrum.addresses.protocol,
        fxTokenAddress: sdkConfig.fxTokenAddresses
      }
    );
  }
}
