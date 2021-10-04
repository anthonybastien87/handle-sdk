import { describe, it } from "@jest/globals";
import { Convert } from "../../src";
import { ethers } from "ethers";

let convertList: Convert;
let convertSwap: Convert;

describe("Convert", function () {
  beforeAll(async () => {
    convertList = new Convert("homestead");
    convertSwap = new Convert("kovan");
  });

  it("Should return a list of tokens", async () => {
    const tokens = await convertList.getTokens();
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("Should return different tokens when the network changes", async () => {
    const SECOND_NETWORK = "polygon";

    const networkOneTokens = await convertList.getTokens();

    if (process.env.NETWORK === SECOND_NETWORK) {
      throw new Error("ENV network is the same as SECOND_NETWORK");
    }

    const secondConvert = new Convert(SECOND_NETWORK);

    const networkTwoTokens = await secondConvert.getTokens();

    expect(networkOneTokens.length !== networkTwoTokens.length).toBeTruthy();
  });

  it("Should fetch price data for a trade", async () => {
    const priceResult = await convertSwap.getQuote(
      "ETH",
      "0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa",
      ethers.utils.parseEther("1"),
      undefined,
      "1",
      "1"
    );
    expect(priceResult.price).toBeTruthy();
  });
});
