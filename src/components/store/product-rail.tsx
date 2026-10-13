"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  canary: "bg-canary text-accent-foreground",
  powder: "bg-powder text-primary-foreground",
  custard: "bg-custard text-accent-foreground",
  rose: "bg-rose text-primary-foreground",
  neutral: "bg-muted text-muted-foreground",
};

/** Trilho horizontal com snap + setas. Recebe os cards já renderizados (server) como children. */
export function ProductRail({
  title,
  subtitle,
  href,
  tone = "neutral",
  children,
}: {
  title: string;
  subtitle?: string;
  href: string;
  tone?: keyof typeof tones;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section className="animate-fade-up">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", tones[tone])}>{title}</span>
          {subtitle && <p className="hidden text-sm text-muted-foreground sm:block">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Link href={href} className="mr-2 text-sm text-muted-foreground hover:text-foreground">Ver todos</Link>
          <button type="button" onClick={() => scroll(-1)} aria-label="Rolar para a esquerda" className="grid size-8 place-items-center rounded-full border bg-card hover:bg-muted"><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={() => scroll(1)} aria-label="Rolar para a direita" className="grid size-8 place-items-center rounded-full border bg-card hover:bg-muted"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div ref={ref} className="rail -mx-4 px-4">
        {children}
      </div>
    </section>
  );
}
