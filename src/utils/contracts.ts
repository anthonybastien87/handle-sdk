import { Contract as MultiCallContract } from "ethers-multicall";

export const createMultiCallContract = <T>(address: string, abi: any) =>
  new MultiCallContract(address, abi as any) as unknown as T;
