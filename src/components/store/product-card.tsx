import Image from "next/image";
import Link from "next/link";
import { formatBRL } from "@/lib/money";
import { thumbUrl } from "@/lib/media";
import { BADGE_TAGS, KNOWN_TAGS, tagLabel } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { Product, ProductImage } from "@/db/schema";

const badgeTone: Record<string, string> = {
  canary: "bg-canary text-accent-foreground",
  powder: "bg-powder text-primary-foreground",
  custard: "bg-custard text-accent-foreground",
  rose: "bg-rose text-primary-foreground",
  neutral: "bg-muted text-muted-foreground",
};

type CardProduct = Product & { images: ProductImage[]; category?: { name: string } | null };

export function ProductCard({ product, index = 0, className }: { product: CardProduct; index?: number; className?: string }) {
  const img = thumbUrl(product.images);
  const onSale = !!product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents;
  const off = onSale ? Math.round((1 - product.priceCents / product.compareAtPriceCents!) * 100) : 0;
  const tag = product.tags.find((t) => BADGE_TAGS.includes(t));
  const lowStock = product.stockQty > 0 && product.stockQty <= 3;

  return (
    <Link
      href={`/produtos/${product.slug}`}
      style={{ "--i": index } as React.CSSProperties}
      className={cn("stagger group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lg", className)}
    >
      <div className="relative aspect-square overflow-hidden bg-blush">
        {img ? (
          <Image src={img} alt={product.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center"><Image src="/brand/logo-icon.png" alt="" width={96} height={96} className="size-16 opacity-40" /></div>
        )}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {onSale && <span className="rounded-full bg-canary px-2 py-0.5 text-[11px] font-bold text-accent-foreground">-{off}%</span>}
          {tag && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", badgeTone[KNOWN_TAGS[tag]?.tone ?? "neutral"])}>{tagLabel(tag)}</span>}
        </div>
        {product.kind === "custom" ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-canary px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">Sob orçamento</span>
        ) : product.isCustomizable ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium backdrop-blur">Personalizável</span>
        ) : null}
        {lowStock && product.kind !== "custom" && <span className="absolute bottom-2 right-2 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-blush">Só {product.stockQty}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.category && <p className="text-xs text-muted-foreground">{product.category.name}</p>}
        <p className="font-medium leading-tight">{product.name}</p>
        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="font-semibold">{product.kind === "custom" && <span className="mr-1 text-xs font-normal text-muted-foreground">a partir de</span>}{formatBRL(product.priceCents)}</span>
          {onSale && <span className="text-xs text-muted-foreground line-through">{formatBRL(product.compareAtPriceCents)}</span>}
        </div>
      </div>
    </Link>
  );
}
