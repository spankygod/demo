import type { BagsCoinDetailData } from "@/lib/bags-api";
import { formatPercent, formatPrice } from "@/lib/market-format";

export const coinActionClassName =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors";

export const shortenKey = (value?: string | null) => {
  if (!value) {
    return "Not available";
  }

  return value.length > 18
    ? `${value.slice(0, 8)}...${value.slice(-7)}`
    : value;
};

export const getSafeExternalUrl = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  const hasProtocol = /^[a-z][a-z\d+.-]*:/iu.test(trimmedValue);
  const candidate = hasProtocol
    ? trimmedValue
    : trimmedValue.startsWith("//")
      ? `https:${trimmedValue}`
      : `https://${trimmedValue}`;

  try {
    const url = new URL(candidate);

    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

export const formatLamports = (value: string | null) => {
  if (!value) {
    return "Not available";
  }

  const lamports = Number(value);

  if (!Number.isFinite(lamports)) {
    return `${value} lamports`;
  }

  return `${(lamports / 1_000_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })} SOL`;
};

export const formatTokenSupply = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const supply = Number(value);

  if (!Number.isFinite(supply)) {
    return value;
  }

  return supply.toLocaleString(undefined, {
    maximumFractionDigits: supply >= 1_000 ? 0 : 4,
  });
};

export const getFullyDilutedValuation = (coin: BagsCoinDetailData) => {
  const supply = Number(coin.market.tokenSupply);
  const price = coin.market.price;

  if (
    price === null ||
    price === undefined ||
    !Number.isFinite(price) ||
    !Number.isFinite(supply)
  ) {
    return null;
  }

  return price * supply;
};

export const formatMarketSource = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  return value
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
};

export const formatStatus = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());

export const getPoolLabel = (
  status: BagsCoinDetailData["token"]["migrationStatus"],
) => {
  if (status === "migrated") {
    return "Migrated pool";
  }

  if (status === "dbc") {
    return "Live DBC";
  }

  return "Fresh launch";
};

export const getCategories = (coin: BagsCoinDetailData) => [
  "BagsApp Ecosystem",
  getPoolLabel(coin.token.migrationStatus),
  formatStatus(coin.token.status),
];

export const getQuoteSummary = (quote: BagsCoinDetailData["quote"]) => {
  if (!quote || typeof quote !== "object") {
    return null;
  }

  const maybeQuote = quote as {
    outAmount?: unknown;
    priceImpactPct?: unknown;
    routePlan?: unknown;
  };

  return {
    outAmount:
      typeof maybeQuote.outAmount === "string" ? maybeQuote.outAmount : null,
    priceImpactPct:
      typeof maybeQuote.priceImpactPct === "string"
        ? maybeQuote.priceImpactPct
        : null,
    routeCount: Array.isArray(maybeQuote.routePlan)
      ? maybeQuote.routePlan.length
      : null,
  };
};

export const formatSnapshotDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Snapshot";
  }

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
};

const maxDetailChartPoints = 180;

const downsampleChartPoints = <T>(
  points: T[],
  maxPoints = maxDetailChartPoints,
) => {
  if (points.length <= maxPoints) {
    return points;
  }

  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round(
      (index / (maxPoints - 1)) * (points.length - 1),
    );

    return points[sourceIndex] as T;
  });
};

const getSeriesChange = (points: Array<{ value: number }>) => {
  const first = points.at(0)?.value;
  const last = points.at(-1)?.value;

  if (
    first === undefined ||
    last === undefined ||
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    first <= 0
  ) {
    return null;
  }

  return ((last - first) / first) * 100;
};

const buildSignalFallbackPoints = (value: number) => {
  const base = Number.isFinite(value) ? value : 1;
  const now = Date.now();
  const amplitude = Math.max(Math.abs(base) * 0.08, 0.8);
  const offsets = [
    -0.45, -0.1, 0.25, 0.05, 0.45, 0.2, 0.65, 0.35, 0.8, 0.55, 1,
  ];
  const middleIndex = Math.floor((offsets.length - 1) / 2);

  return offsets.map((offset, index) => ({
    label:
      index === 0
        ? "Current"
        : index === offsets.length - 1
          ? "Latest"
          : index === middleIndex
            ? "Signal"
            : "",
    timestamp: now - (offsets.length - 1 - index) * 60 * 60 * 1000,
    value: Number(Math.max(base + offset * amplitude, 0).toFixed(4)),
    volume: null,
  }));
};

export type ChartRange = "1H" | "6H" | "24H" | "7D";

const chartRangeMs: Record<ChartRange, number> = {
  "1H": 60 * 60 * 1000,
  "6H": 6 * 60 * 60 * 1000,
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
};

export const buildChartSeries = (
  coin: BagsCoinDetailData,
  range: ChartRange = "7D",
) => {
  const latestTimestamp =
    coin.marketHistory
      .map((snapshot) => new Date(snapshot.capturedAt).getTime())
      .filter((timestamp) => Number.isFinite(timestamp))
      .reduce((latest, timestamp) => Math.max(latest, timestamp), 0) ||
    Date.now();
  const windowStart = latestTimestamp - chartRangeMs[range];
  const pricePoints = coin.marketHistory
    .filter((snapshot) => snapshot.price !== null)
    .map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      label: formatSnapshotDate(snapshot.capturedAt),
      timestamp: new Date(snapshot.capturedAt).getTime(),
      value: snapshot.price as number,
      volume: snapshot.volume24h,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.timestamp) && point.timestamp >= windowStart,
    );

  if (pricePoints.length > 0) {
    const points = downsampleChartPoints(pricePoints);
    const change = getSeriesChange(points);

    return {
      title: "Price Chart",
      sourceLabel: `${range} cached price snapshots`,
      points,
      formatValue: formatPrice,
      negative:
        points.length > 1 ? points.at(-1)!.value < points[0]!.value : false,
      sparse: pricePoints.length < 24,
      changeLabel: change === null ? "-" : formatPercent(change),
    };
  }

  const signalPoints = coin.marketHistory
    .filter((snapshot) => snapshot.marketSignal !== null)
    .map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      label: formatSnapshotDate(snapshot.capturedAt),
      timestamp: new Date(snapshot.capturedAt).getTime(),
      value: snapshot.marketSignal as number,
      volume: snapshot.volume24h,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.timestamp) && point.timestamp >= windowStart,
    );

  const points =
    signalPoints.length >= 2
      ? downsampleChartPoints(signalPoints)
      : buildSignalFallbackPoints(coin.marketSignal.value);

  return {
    title: "Bags Signal Chart",
    sourceLabel: "Price history pending",
    points,
    formatValue: (value?: number | null) =>
      value === null || value === undefined ? "-" : value.toFixed(1),
    negative: false,
    sparse: true,
    changeLabel: "-",
  };
};
