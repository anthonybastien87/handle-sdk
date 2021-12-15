export const getAvailableAddresses = <T>(
  addresses: Partial<T>
): {
  symbol: keyof T;
  address: string;
}[] => {
  return (Object.keys(addresses) as []).map((key) => {
    const k = key as any;
    const a = addresses as any;

    return {
      symbol: key,
      address: a[k]
    };
  });
};
