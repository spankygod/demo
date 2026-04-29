import { ArrowUp } from "lucide-react";

export function PositiveText({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-green-400">
      <ArrowUp className="size-3" />
      {value.replace("+", "")}
    </span>
  );
}

export function ChangeText({ value }: { value: string }) {
  if (value === "-") {
    return <span className="text-slate-500">-</span>;
  }

  const negative = value.startsWith("-");

  return (
    <span
      className={
        negative
          ? "font-medium text-red-400"
          : "inline-flex items-center gap-1 font-medium text-green-400"
      }
    >
      {negative ? null : <ArrowUp className="size-3" />}
      {value.replace("+", "")}
    </span>
  );
}
