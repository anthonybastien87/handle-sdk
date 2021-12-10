import config from "./config";
import { FxTokenSymbol, FxTokenSymbolMap } from "./types/fxTokens";
import FxTokensSDK from "./components/FxTokens";
import PricesSDK from "./components/Prices";
import GraphSDK, {
  IndexedFxTokenData,
  IndexedVaultData,
  IndexedFxKeeperPoolData
} from "./components/Graph";

// utils
import { getNetworkName } from "./utils/web3";

export { FxTokensSDK, PricesSDK, GraphSDK, config, getNetworkName };

export type {
  FxTokenSymbol,
  FxTokenSymbolMap,
  IndexedFxTokenData,
  IndexedVaultData,
  IndexedFxKeeperPoolData
};
