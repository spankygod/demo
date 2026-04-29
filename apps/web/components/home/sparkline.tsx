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

  if (values.length < 2) {
    return <span className="text-xs text-slate-600">-</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Number.EPSILON);
  const positive = values.at(-1)! >= values[0]!;
  const stroke = positive ? "#22c55e" : "#ff3b30";
  const coordinates = values.map((point, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((point - min) / span) * (height - 5) - 2.5;

    return [x, y] as const;
  });
  const linePath = coordinates
    .map(([x, y], index) => {
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
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
