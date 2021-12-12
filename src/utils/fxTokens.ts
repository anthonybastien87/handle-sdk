import { FxTokenSymbol } from "..";
import { FxTokenAddresses } from "../config";

export const getAvailableTokens = (addresses: FxTokenAddresses) => {
  return (Object.keys(addresses) as FxTokenSymbol[]).map((symbol) => ({
    symbol,
    address: addresses[symbol]
  }));
};
