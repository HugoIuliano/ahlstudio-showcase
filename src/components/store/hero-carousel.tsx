"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export type HeroSlide = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  imageUrl: string | null;
  categoryName: string | null;
  tags: string[];
};

const INTERVAL = 5000;

/** Carrossel hero: autoplay, arrasta, setas, bolinhas. Foca nos produtos com a tag "destaques". */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const railRef = useRef<HTMLDivElement>(null);
  const count = slides.length;

  const go = useCallback(
    (i: number) => {
      const next = (i + count) % count;
      setIndex(next);
      const rail = railRef.current;
      if (rail) rail.scrollTo({ left: next * rail.clientWidth, behavior: "smooth" });
    },
    [count],
  );

  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setInterval(() => go(index + 1), INTERVAL);
    return () => clearInterval(t);
  }, [playing, index, count, go]);

  // sincroniza índice quando o usuário arrasta
  const onScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    const i = Math.round(rail.scrollLeft / rail.clientWidth);
    if (i !== index) setIndex(i);
  };

  if (count === 0) return null;

  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose via-blush to-custard shadow-sm"
      onMouseEnter={() => setPlaying(false)}
      onMouseLeave={() => setPlaying(true)}
      aria-roledescription="carrossel"
    >
      <div ref={railRef} onScroll={onScroll} className="rail !gap-0 !pb-0">
        {slides.map((s, i) => {
          const onSale = s.compareAtPriceCents && s.compareAtPriceCents > s.priceCents;
          const off = onSale ? Math.round((1 - s.priceCents / s.compareAtPriceCents!) * 100) : 0;
          return (
            <article key={s.id} className="grid w-full min-w-0 shrink-0 basis-full items-center gap-5 p-5 sm:p-6 md:grid-cols-2 md:p-12" aria-hidden={i !== index}>
              <div className={cn("order-2 md:order-1", i === index && "animate-fade-up")}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{s.categoryName ?? "Destaque"}</p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl md:text-4xl lg:text-5xl">{s.name}</h2>
                {s.description && <p className="mt-3 line-clamp-3 max-w-md text-muted-foreground">{s.description}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="text-2xl font-semibold">{formatBRL(s.priceCents)}</span>
                  {onSale && (
                    <>
                      <span className="text-muted-foreground line-through">{formatBRL(s.compareAtPriceCents)}</span>
                      <span className="rounded-full bg-canary px-2.5 py-0.5 text-xs font-bold text-accent-foreground">-{off}%</span>
                    </>
                  )}
                </div>
                <Link href={`/produtos/${s.slug}`} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-6 font-medium text-blush transition-transform hover:scale-[1.03]">
                  Ver produto <ArrowRight className="size-4" />
                </Link>
              </div>
              <Link href={`/produtos/${s.slug}`} className="order-1 md:order-2">
                <div className={cn("relative mx-auto aspect-[4/3] w-full max-w-full overflow-hidden rounded-3xl bg-white/60 shadow-lg sm:aspect-square sm:max-w-md", i === index && "animate-float")}>
                  {s.imageUrl ? (
                    <Image src={s.imageUrl} alt={s.name} fill priority={i === 0} sizes="(max-width: 768px) 90vw, 40vw" className="object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center"><Image src="/brand/logo-icon.png" alt="" width={160} height={160} className="size-24 opacity-60 sm:size-40" /></div>
                  )}
                </div>
              </Link>
            </article>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Anterior" className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white md:grid">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Próximo" className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white md:grid">
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 backdrop-blur">
            {slides.map((s, i) => (
              <button key={s.id} type="button" aria-label={`Ir para ${i + 1}`} onClick={() => go(i)} className={cn("h-2 rounded-full bg-foreground/30 transition-all", i === index ? "w-6 bg-foreground" : "w-2")} />
            ))}
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pausar" : "Reproduzir"} className="ml-1 grid size-5 place-items-center text-foreground/70">
              {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
