import config from "./config";
import { FxTokenSymbol, FxTokenSymbolMap } from "./types/fxTokens";
import FxTokensSDK from "./components/FxTokens";
import PricesSDK from "./components/Prices";
import VaultsSDK from "./components/Vaults";
import { Vault } from "./components/Vaults/Vaults";
import GraphSDK, { IndexedFxToken, IndexedVault, IndexedFxKeeperPool } from "./components/Graph";

// utils
import { getNetworkName } from "./utils/web3";

export { FxTokensSDK, PricesSDK, VaultsSDK, GraphSDK, config, getNetworkName };

export type {
  FxTokenSymbol,
  FxTokenSymbolMap,
  IndexedFxToken,
  IndexedVault,
  IndexedFxKeeperPool,
  Vault
};
