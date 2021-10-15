import axios from "axios";
import { BigNumber } from "ethers";
import homestead from "../../tokens/homestead.json";
import polygon from "../../tokens/polygon.json";
import arbitrum from "../../tokens/arbitrum.json";
import { Config } from "./Config";

type Token = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  icon: string;
  displayDecimals: number;
};

type SupportedNetwork = "homestead" | "polygon" | "arbitrum";

// this is a short term solution to ensure that sdk users
// cant bypass the handle convert fees.
const HANDLE_TOKEN_TYPES: { [key: string]: string } = {
  USDC: "USD",
  LUSD: "USD",
  DAI: "USD",
  USDT: "USD",
  sUSD: "USD",
  EURS: "EURO"
};

type Swap = Quote & {
  to: string;
  value: string;
  data: string;
};

type Quote = {
  buyAmount: string;
  sellAmount: string;
  gas: string;
  allowanceTarget: string;
};

export class Convert {
  private tokenAddressToType: { [key: string]: string } | undefined;
  private tokenList: Token[];

  constructor(private network: SupportedNetwork) {
    let tokenList;
    switch (network) {
      case "polygon":
        tokenList = polygon;
        break;
      case "arbitrum":
        tokenList = arbitrum;
        break;
      case "homestead":
        tokenList = homestead;
        break;
      default:
        throw new Error("Network not supported for convert");
    }

    this.tokenList = tokenList;
  }

  public getTokens = async () => {
    await this.setTokenAddressToType(this.tokenList);
    return this.tokenList;
  };

  public getQuote = async (
    sellToken: string,
    buyToken: string,
    sellAmount: BigNumber | undefined,
    buyAmount: BigNumber | undefined,
    gasPriceInWei: string
  ): Promise<Quote> => {
    if (this.network === "arbitrum") {
      if (!sellAmount) {
        throw new Error("Must supply a sell amount when trading on arbitrum");
      }
      return this.get1InchQuote(sellToken, buyToken, sellAmount, gasPriceInWei);
    }

    return this.get0xQuote(sellToken, buyToken, sellAmount, buyAmount, gasPriceInWei);
  };

  public getSwap = async (
    sellToken: string,
    buyToken: string,
    sellAmount: BigNumber | undefined,
    buyAmount: BigNumber | undefined,
    slippagePercentage: string,
    gasPriceInWei: string,
    fromAddress: string
  ): Promise<Swap> => {
    if (sellAmount && buyAmount) {
      throw new Error("Can't set both sell and buy amounts");
    }

    if (!this.tokenAddressToType) {
      await this.setTokenAddressToType();
    }

    if (this.network === "arbitrum") {
      if (!sellAmount) {
        throw new Error("Must supply a sell amount when trading on arbitrum");
      }

      return this.get1InchSwap(
        sellToken,
        buyToken,
        sellAmount,
        slippagePercentage,
        gasPriceInWei,
        fromAddress
      );
    }

    return this.get0xSwap(
      sellToken,
      buyToken,
      sellAmount,
      buyAmount,
      slippagePercentage,
      gasPriceInWei
    );
  };

  private get0xQuote = async (
    sellToken: string,
    buyToken: string,
    sellAmount: BigNumber | undefined,
    buyAmount: BigNumber | undefined,
    gasPriceInWei: string
  ): Promise<Quote> => {
    const { data } = await axios.get(`${this.get0xBaseUrl()}/price`, {
      params: {
        buyToken,
        sellToken,
        sellAmount: sellAmount?.toString(),
        buyAmount: buyAmount?.toString(),
        buyTokenPercentageFee: this.getFees(sellToken, buyToken),
        feeRecipient: Config.feeAddress,
        gasPrice: gasPriceInWei
      }
    });

    return {
      buyAmount: data.buyAmount,
      sellAmount: data.sellAmount,
      gas: data.gas,
      allowanceTarget: data.allowanceTarget
    };
  };

  private get1InchQuote = async (
    sellToken: string,
    buyToken: string,
    sellAmount: BigNumber,
    gasPriceInWei: string
  ): Promise<Quote> => {
    const { data } = await axios.get(`${this.get1InchBaseUrl()}/quote`, {
      params: {
        fromTokenAddress: sellToken,
        toTokenAddress: buyToken,
        amount: sellAmount.toString(),
        fee: this.getFees(sellToken, buyToken),
        gasPrice: gasPriceInWei
      }
    });

    const {
      data: { address: allowanceTarget }
    } = await axios.get(`${this.get1InchBaseUrl()}/approve/spender`);

    return {
      buyAmount: data.toTokenAmount,
      sellAmount: data.fromTokenAmount,
      gas: data.estimatedGas,
      allowanceTarget
    };
  };

  private get0xSwap = async (
    sellToken: string,
    buyToken: string,
    sellAmount: BigNumber | undefined,
    buyAmount: BigNumber | undefined,
    slippagePercentage: string,
    gasPriceInWei: string
  ): Promise<Swap> => {
    const { data } = await axios.get(`${this.get0xBaseUrl()}/quote`, {
      params: {
        buyToken,
        sellToken,
        sellAmount: sellAmount?.toString(),
        buyAmount: buyAmount?.toString(),
        feeRecipient: Config.feeAddress,
        affiliateAddress: Config.feeAddress,
        buyTokenPercentageFee: this.getFees(sellToken, buyToken),
        slippagePercentage: Number(slippagePercentage) / 100,
        gasPrice: gasPriceInWei
      }
    });

    return {
      to: data.to,
      buyAmount: data.buyAmount,
      sellAmount: data.sellAmount,
      allowanceTarget: data.allowanceTarget,
      value: data.value,
      data: data.data,
      gas: data.gas
    };
  };

  public get1InchSwap = async (
    sellToken: string,
    buyToken: string,
    sellAmount: BigNumber,
    slippagePercentage: string,
    gasPriceInWei: string,
    fromAddress: string
  ): Promise<Swap> => {
    if (!this.tokenAddressToType) {
      await this.setTokenAddressToType();
    }

    const { data } = await axios.get(`${this.get1InchBaseUrl()}/swap`, {
      params: {
        fromTokenAddress: sellToken,
        toTokenAddress: buyToken,
        amount: sellAmount.toString(),
        fromAddress,
        slippage: slippagePercentage,
        referrerAddress: Config.feeAddress,
        fee: this.getFees(sellToken, buyToken),
        gasPrice: gasPriceInWei
      }
    });

    const {
      data: { address: allowanceTarget }
    } = await axios.get(`${this.get1InchBaseUrl()}/approve/spender`);

    return {
      to: data.tx.to,
      buyAmount: data.toTokenAmount,
      sellAmount: data.fromTokenAmount,
      allowanceTarget,
      value: data.tx.value,
      data: data.tx.data,
      gas: data.tx.gas
    };
  };

  private setTokenAddressToType = async (tokens?: Token[]) => {
    this.tokenAddressToType = {};

    try {
      tokens = tokens || (await this.getTokens());

      tokens.forEach((t) => {
        if (!this.tokenAddressToType) {
          return;
        }

        if (HANDLE_TOKEN_TYPES[t.symbol]) {
          this.tokenAddressToType[t.address] = HANDLE_TOKEN_TYPES[t.symbol];
        }
      });
    } catch (e) {
      console.error("Failed to fetch token list. User will be charged the highest fee");
    }
  };

  private getFees = (sellToken: string, buyToken: string) => {
    const sellTokenType = this.tokenAddressToType?.[sellToken];
    const buyTokenType = this.tokenAddressToType?.[buyToken];

    if (!sellTokenType || !buyTokenType) {
      return "0.003";
    }

    if (sellTokenType === buyTokenType) {
      return "0.0004";
    }

    return "0.001";
  };

  private get0xBaseUrl = () =>
    `https://${this.network === "homestead" ? "" : this.network + "."}api.0x.org/swap/v1`;

  private get1InchBaseUrl = () => {
    const networkNameToIdMap: { [key in SupportedNetwork]: number } = {
      homestead: 1,
      polygon: 137,
      arbitrum: 42161
    };
    return `https://api.1inch.exchange/v3.0/${networkNameToIdMap[this.network]}`;
  };
}
