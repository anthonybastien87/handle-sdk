import { describe, it } from "@jest/globals";
import { Convert } from "../../src";
import { ethers } from "ethers";

let convert: Convert;

describe("Convert", function () {
  beforeAll(async () => {
    convert = new Convert("homestead");
  });

  it("Should return a list of tokens", async () => {
    const tokens = await convert.getTokens();
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("Should return different tokens when the network changes", async () => {
    const SECOND_NETWORK = "polygon";

    const networkOneTokens = await convert.getTokens();

    if (process.env.NETWORK === SECOND_NETWORK) {
      throw new Error("ENV network is the same as SECOND_NETWORK");
    }

    const secondConvert = new Convert(SECOND_NETWORK);

    const networkTwoTokens = await secondConvert.getTokens();

    expect(networkOneTokens.length !== networkTwoTokens.length).toBeTruthy();
  });

  it("Should fetch price data for a trade", async () => {
    const priceResult = await convert.getQuote(
      "ETH",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      ethers.utils.parseEther("1"),
      undefined,
      "1"
    );
    expect(priceResult.buyAmount).toBeTruthy();
  });
});
