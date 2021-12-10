export type FxTokenSymbol = "fxAUD" | "fxPHP" | "fxUSD" | "fxEUR" | "fxKRW" | "fxCNY";

export type FxTokenSymbolMap<T> = { [key in FxTokenSymbol]: T };
