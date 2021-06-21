﻿import { describe, it } from "@jest/globals";
import { ethers } from "ethers";
import { IndexedFxlTokenData, readFxTokens } from "../../src/readers/fxTokens";
import { getKovanGqlClient } from "../utils";

const gql = getKovanGqlClient();

describe("Readers: fxTokens", () => {
  it("Should return indexed fxToken data", async () => {
    const fxTokens = (await readFxTokens(gql)) as IndexedFxlTokenData[];
    expect(fxTokens.length > 0);
    for (let fxToken of fxTokens) {
      expect(ethers.BigNumber.isBigNumber(fxToken.totalSupply));
    }
  });
});
