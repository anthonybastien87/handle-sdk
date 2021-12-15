export type CollateralSymbol = "FOREX" | "WETH";
export type CollateralSymbolMap<T> = { [key in CollateralSymbol]: T };
