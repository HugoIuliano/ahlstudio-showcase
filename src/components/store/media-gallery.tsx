"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play, Volume2, VolumeX } from "lucide-react";
import type { ProductImage } from "@/db/schema";
import { cn } from "@/lib/utils";

/**
 * Galeria vertical estilo Instagram/Reels: 9:16 (4:5 no desktop), swipe com snap,
 * vídeos tocam mudos quando visíveis e pausam ao sair; miniaturas embaixo.
 */
export function MediaGallery({ media, name }: { media: ProductImage[]; name: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const count = media.length;

  const go = (i: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const next = Math.max(0, Math.min(count - 1, i));
    rail.scrollTo({ left: next * rail.clientWidth, behavior: "smooth" });
    setIndex(next);
  };

  const onScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    const i = Math.round(rail.scrollLeft / rail.clientWidth);
    if (i !== index) setIndex(i);
  };

  // toca só o vídeo ativo
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === index) v.play().catch(() => {});
      else {
        v.pause();
        v.currentTime = 0;
      }
    });
  }, [index]);

  if (count === 0) {
    return (
      <div className="grid aspect-[4/3] w-full place-items-center gap-2 rounded-3xl bg-blush text-muted-foreground sm:aspect-[4/5]">
        <Image src="/brand/logo-icon.png" alt="" width={160} height={160} className="size-28 opacity-50" />
        <p className="text-xs">Fotos em breve — cada peça é feita sob encomenda</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-foreground/95 shadow-md">
        <div ref={railRef} onScroll={onScroll} className="rail !gap-0 !pb-0 aspect-[9/16] w-full sm:aspect-[4/5]">
          {media.map((m, i) => (
            <div key={m.id} className="relative h-full w-full shrink-0">
              {m.type === "video" ? (
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  src={m.url}
                  poster={m.posterUrl ?? undefined}
                  className="h-full w-full object-cover"
                  playsInline
                  loop
                  muted={muted}
                  preload={i === 0 ? "auto" : "metadata"}
                  autoPlay={i === 0}
                  onClick={(e) => {
                    const v = e.currentTarget;
                    if (v.paused) v.play().catch(() => {});
                    else v.pause();
                  }}
                />
              ) : (
                <Image
                  src={m.url}
                  alt={m.alt ?? `${name} — foto ${i + 1}`}
                  fill
                  priority={i === 0}
                  sizes="(max-width: 640px) 100vw, 480px"
                  className="object-cover"
                  draggable={false}
                />
              )}
            </div>
          ))}
        </div>

        {/* barra de progresso estilo stories */}
        {count > 1 && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex gap-1">
            {media.map((m, i) => (
              <span key={m.id} className={cn("h-1 flex-1 rounded-full bg-white/40 transition-colors", i <= index && "bg-white")} />
            ))}
          </div>
        )}

        {media[index]?.type === "video" && (
          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            aria-label={muted ? "Ativar som" : "Silenciar"}
            className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        )}

        {count > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} aria-label="Anterior" className={cn("absolute left-2 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white sm:grid", index === 0 && "sm:hidden")}>
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Próximo" className={cn("absolute right-2 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow hover:bg-white sm:grid", index === count - 1 && "sm:hidden")}>
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="rail">
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Mídia ${i + 1}`}
              className={cn("relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-xl border-2 bg-blush transition-all", i === index ? "border-foreground" : "border-transparent opacity-70 hover:opacity-100")}
            >
              {m.type === "video" ? (
                <>
                  {m.posterUrl ? <Image src={m.posterUrl} alt="" fill sizes="56px" className="object-cover" /> : <video src={m.url} muted preload="metadata" className="h-full w-full object-cover" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/25 text-white"><Play className="size-4 fill-current" /></span>
                </>
              ) : (
                <Image src={m.url} alt="" fill sizes="56px" className="object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
