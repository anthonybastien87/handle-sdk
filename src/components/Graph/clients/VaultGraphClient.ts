import { ethers } from "ethers";
import { GraphQLClient, gql } from "graphql-request/dist";
import { buildFilter } from "../utils";
import FxTokenGraphClient from "./FxTokenGraphClient";

export type IndexedVaultData = {
  debt: ethers.BigNumber;
  /** fxToken address */
  fxToken: string;
  account: string;
  collateralTokens: { address: string; amount: ethers.BigNumber }[];
  redeemableTokens: ethers.BigNumber;
  collateralAsEther: ethers.BigNumber;
  collateralRatio: ethers.BigNumber;
  minimumRatio: ethers.BigNumber;
  isRedeemable: boolean;
  isLiquidatable: boolean;
};

type QueryResponse = {
  vaults: {
    account: string;
    debt: string;
    fxToken: string;
    collateralTokens: {
      address: string;
      amount: string;
    }[];
    redeemableTokens: string;
    collateralAsEther: string;
    collateralRatio: string;
    minimumRatio: string;
    isRedeemable: string;
    isLiquidatable: string;
  }[];
};

export default class VaultGraphClient {
  constructor(private client: GraphQLClient, private fxTokenGraphClient: FxTokenGraphClient) {}

  public queryOne = async (filter: any): Promise<IndexedVaultData> => {
    const response = await this.query({ ...filter, first: 1 });
    return response[0];
  };

  public query = async (filter: any): Promise<IndexedVaultData[]> => {
    const data = await this.client.request<QueryResponse>(this.getQueryString(filter));
    // If the array is not present, there was an error in the request.
    if (!Array.isArray(data?.vaults)) throw new Error("Could not load indexed vault data");

    return data.vaults.map((vault) => ({
      debt: ethers.BigNumber.from(vault.debt),
      account: vault.account,
      fxToken: vault.fxToken,
      collateralTokens: vault.collateralTokens.map((ct) => ({
        ...ct,
        amount: ethers.BigNumber.from(ct.amount)
      })),
      redeemableTokens: ethers.BigNumber.from(vault.redeemableTokens),
      collateralAsEther: ethers.BigNumber.from(vault.collateralAsEther),
      collateralRatio: ethers.BigNumber.from(vault.collateralRatio),
      minimumRatio: ethers.BigNumber.from(vault.minimumRatio),
      isRedeemable: JSON.parse(vault.isRedeemable),
      isLiquidatable: JSON.parse(vault.isLiquidatable)
    }));
  };

  public withLowestCRForEachFxToken = async (): Promise<IndexedVaultData[]> => {
    const tokens = await this.fxTokenGraphClient.query({});

    const result = await Promise.all(
      tokens.map(async (token) =>
        this.queryOne({
          first: 1,
          where: { fxToken: token.address },
          orderBy: "collateralRatio",
          orderDirection: "asc"
        })
      )
    );

    return result.filter((r) => !!r);
  };

  private getQueryString = (filter: any) => gql`
  query {
    vaults${buildFilter(filter)} {
      account
      debt
      fxToken
      collateralTokens {
        address
        amount
      }
      redeemableTokens
      collateralAsEther
      collateralRatio
      minimumRatio
      isRedeemable
      isLiquidatable
    }
  }
`;
}
