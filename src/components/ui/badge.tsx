import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-100 text-sky-800",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  accent: "bg-teal-100 text-teal-800",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}

/** Badge a partir de um mapa de labels (labels.ts). */
export function StatusBadge<T extends string>({
  value,
  map,
}: {
  value: T;
  map: Record<T, { label: string; tone: Tone }>;
}) {
  const entry = map[value] ?? { label: value, tone: "neutral" as Tone };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
