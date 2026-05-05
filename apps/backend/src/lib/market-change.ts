type PriceHistoryPoint = {
  price: number | null;
};

export const getPercentChange = (
  currentPrice: number | null | undefined,
  referencePrice: number | null | undefined,
) => {
  if (
    currentPrice === null ||
    currentPrice === undefined ||
    referencePrice === null ||
    referencePrice === undefined ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  ) {
    return null;
  }

  return Number(
    (((currentPrice - referencePrice) / referencePrice) * 100).toFixed(2),
  );
};

export const getWindowChange = (
  currentPrice: number | null | undefined,
  referencePrice: number | null | undefined,
  history: PriceHistoryPoint[] | undefined,
) => {
  const exactChange = getPercentChange(currentPrice, referencePrice);

  if (exactChange !== null) {
    return exactChange;
  }

  const pricePoints =
    history?.filter(
      (point) => point.price !== null && Number.isFinite(point.price),
    ) ?? [];

  if (pricePoints.length < 2) {
    return null;
  }

  return getPercentChange(currentPrice, pricePoints[0]?.price);
};
