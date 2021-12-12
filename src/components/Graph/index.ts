import config from "../../config";
import { GraphQLClient } from "graphql-request/dist";
import FxTokenGraphClient, { IndexedFxToken } from "./clients/FxTokenGraphClient";
import VaultGraphClient, { IndexedVault } from "./clients/VaultGraphClient";
import FxKeeperPoolClient, { IndexedFxKeeperPool } from "./clients/FxKeeperPoolClient";

type SupportedNetwork = "arbitrum";
const SUPPORTED_NETWORKS: SupportedNetwork[] = ["arbitrum"];

export default class Graph {
  static isSupportedNetwork = (network: SupportedNetwork) => SUPPORTED_NETWORKS.includes(network);

  public fxTokens: FxTokenGraphClient;
  public vaults: VaultGraphClient;
  public fxKeeperPools: FxKeeperPoolClient;

  constructor(network: SupportedNetwork) {
    if (!SUPPORTED_NETWORKS.includes(network)) {
      throw new Error(`fxTokens - Unsupported network: ${network}`);
    }

    const url = config.byNetwork[network].theGraphEndpoint;
    const client = new GraphQLClient(url);

    this.fxTokens = new FxTokenGraphClient(client);
    this.vaults = new VaultGraphClient(client, this.fxTokens);
    this.fxKeeperPools = new FxKeeperPoolClient(client);
  }
}

export type { IndexedFxToken, IndexedVault, IndexedFxKeeperPool };
