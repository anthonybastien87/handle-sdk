import { ethers } from "ethers";
import { FxTokenSymbol, FxTokenSymbolMap } from "..";
import config, { ChainlinkFeeds } from "../config";
import { ChainlinkAggregator__factory } from "../contracts";

type SupportedNetwork = "arbitrum";

const SUPPORTED_NETWORKS: SupportedNetwork[] = ["arbitrum"];

export default class Prices {
  private config: ChainlinkFeeds;

  constructor(
    network: SupportedNetwork,
    private signerOrProvider: ethers.providers.Provider | ethers.Signer
  ) {
    if (!SUPPORTED_NETWORKS.includes(network)) {
      throw new Error(`Prices - Unsupported network: ${network}`);
    }
    this.config = config.byNetwork[network].addresses.chainlinkFeeds;
  }

  public getEthUsdPrice = (): Promise<ethers.BigNumber> => {
    return this.getPrice(this.config.eth_usd, this.signerOrProvider);
  };

  public getFxTokenTargetUsdPrice = (token: FxTokenSymbol) => {
    if (token === "fxUSD") {
      return ethers.utils.parseUnits("1", 8);
    }

    const fxTokenSymbolToFeedAddressMap: FxTokenSymbolMap<string> = {
      fxAUD: this.config.aud_usd,
      fxPHP: this.config.php_usd,
      fxUSD: this.config.usd_usd,
      fxEUR: this.config.eur_usd,
      fxKRW: this.config.krw_usd,
      fxCNY: this.config.cny_usd
    };

    return this.getPrice(fxTokenSymbolToFeedAddressMap[token], this.signerOrProvider);
  };

  private getPrice = (
    feedAddress: string,
    arbitrumProviderOrSigner: ethers.providers.Provider | ethers.Signer
  ): Promise<ethers.BigNumber> => {
    const aggregator = ChainlinkAggregator__factory.connect(feedAddress, arbitrumProviderOrSigner);

    return aggregator.latestAnswer();
  };
}
