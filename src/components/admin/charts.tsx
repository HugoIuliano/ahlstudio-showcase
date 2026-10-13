import { formatBRL } from "@/lib/money";

/**
 * Gráficos leves em SVG (renderizados no servidor). Paleta categórica validada (dataviz):
 * azul #2a78d6 · laranja #eb6834 · água #1baf7a · amarelo #eda100. Marcas finas, topo arredondado,
 * grade discreta, rótulos diretos seletivos e <title> como tooltip nativo.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;

type Series = { name: string; values: number[]; color?: string };

export function GroupedBars({ labels, series, height = 220, money = true, className }: { labels: string[]; series: Series[]; height?: number; money?: boolean; className?: string }) {
  const w = 720;
  const padL = 56;
  const padB = 28;
  const padT = 12;
  const innerW = w - padL - 12;
  const innerH = height - padB - padT;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all.map((v) => Math.abs(v)));
  const min = Math.min(0, ...all);
  const range = max - min || 1;
  const y = (v: number) => padT + innerH - ((v - min) / range) * innerH;
  const zeroY = y(0);
  const groupW = innerW / labels.length;
  const barW = Math.max(3, Math.min(22, (groupW - 8) / series.length - 2));
  const fmt = (v: number) => (money ? formatBRL(v) : String(v));
  const ticks = 4;

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = min + (range * i) / ticks;
          return (
            <g key={i}>
              <line x1={padL} x2={w - 12} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.08} />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.55}>
                {money ? `${Math.round(v / 100).toLocaleString("pt-BR")}` : v.toFixed(0)}
              </text>
            </g>
          );
        })}
        <line x1={padL} x2={w - 12} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity={0.3} />
        {labels.map((label, gi) => (
          <g key={label}>
            {series.map((s, si) => {
              const v = s.values[gi] ?? 0;
              const x = padL + gi * groupW + 4 + si * (barW + 2);
              const top = Math.min(y(v), zeroY);
              const h = Math.max(1, Math.abs(y(v) - zeroY));
              const color = s.color ?? SERIES[si % SERIES.length];
              return (
                <g key={s.name}>
                  <rect x={x} y={top} width={barW} height={h} rx={3} fill={color} />
                  <rect x={x - 2} y={padT} width={barW + 4} height={innerH} fill="transparent">
                    <title>{`${label} · ${s.name}: ${fmt(v)}`}</title>
                  </rect>
                </g>
              );
            })}
            <text x={padL + gi * groupW + groupW / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.7}>{label}</text>
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: s.color ?? SERIES[i % SERIES.length] }} />{s.name}</span>
          ))}
          {money && <span className="ml-auto">eixo em R$ (×1)</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** Barras horizontais para ranking (produto, categoria, cliente). */
export function HBars({ rows, money = true, color = SERIES[0] }: { rows: { label: string; value: number; hint?: string }[]; money?: boolean; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="shrink-0 font-medium">{money ? formatBRL(r.value) : r.value}</span></div>
            <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></div>
            {r.hint && <p className="text-xs text-muted-foreground">{r.hint}</p>}
          </div>
        </li>
      ))}
      {rows.length === 0 && <li className="text-muted-foreground">Sem dados no período.</li>}
    </ul>
  );
}

/** Cascata simplificada da DRE (linhas com barra proporcional). */
export function WaterfallRows({ rows }: { rows: { label: string; value: number; kind: "plus" | "minus" | "total" }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="divide-y text-sm">
      {rows.map((r) => (
        <li key={r.label} className={`grid grid-cols-[minmax(0,1fr)_120px_140px] items-center gap-3 py-2 ${r.kind === "total" ? "font-semibold" : ""}`}>
          <span className={r.kind === "minus" ? "pl-4 text-muted-foreground" : ""}>{r.label}</span>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: r.kind === "minus" ? SERIES[1] : r.kind === "total" ? (r.value < 0 ? "#d03b3b" : SERIES[2]) : SERIES[0] }} />
          </div>
          <span className={`text-right ${r.value < 0 && r.kind === "total" ? "text-danger" : ""}`}>{r.kind === "minus" ? "−" : ""}{formatBRL(Math.abs(r.value))}</span>
        </li>
      ))}
    </ul>
  );
}
