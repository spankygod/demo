const plotPaddingY = 6;
const minRelativeDomain = 0.08;

const toLinePath = (coordinates: Array<readonly [number, number]>) =>
  coordinates
    .map(([x, y], index) => {
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

export function Sparkline({
  points,
  width = 148,
  height = 54,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  const values = points.filter((point) => Number.isFinite(point));

  if (values.length === 0) {
    return <span className="text-xs text-slate-600">-</span>;
  }

  if (values.length === 1) {
    const y = height / 2;
    const startX = width * 0.42;
    const endX = width * 0.58;

    return (
      <svg
        aria-hidden="true"
        className="block"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <line
          opacity="0.55"
          stroke="#71717a"
          strokeLinecap="round"
          strokeWidth="1.6"
          x1={startX}
          x2={endX}
          y1={y}
          y2={y}
        />
        <circle cx={width / 2} cy={y} fill="#71717a" r="2.6" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const isFlat = min === max;
  const midpoint = (min + max) / 2;
  const observedSpan = max - min;
  const minimumSpan = Math.max(
    Math.abs(midpoint) * minRelativeDomain,
    Number.EPSILON,
  );
  const domainSpan = isFlat
    ? minimumSpan
    : Math.max(observedSpan * 1.18, minimumSpan);
  const domainMin = midpoint - domainSpan / 2;
  const plotHeight = Math.max(height - plotPaddingY * 2, 1);
  const first = values[0]!;
  const last = values.at(-1)!;
  const stroke =
    last === first ? "#71717a" : last > first ? "#22c55e" : "#ff3b30";
  const coordinates = values.map((point, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = isFlat
      ? height / 2
      : height - plotPaddingY - ((point - domainMin) / domainSpan) * plotHeight;

    return [x, y] as const;
  });
  const linePath = toLinePath(coordinates);
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      aria-hidden="true"
      className="block"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <path d={areaPath} fill={stroke} opacity="0.08" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
