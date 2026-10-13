import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Layers, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { formatBRL } from "@/lib/money";
import { getSettings, whatsappLink } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { estimateProductionDays } from "@/lib/production";
import { breadcrumbLd, jsonLd, siteUrl } from "@/lib/seo";
import { getBacklog } from "@/lib/production-queue";
import { AddToCartForm } from "@/components/store/add-to-cart-form";
import { ShippingCalculator } from "@/components/store/shipping-calculator";
import { MediaGallery } from "@/components/store/media-gallery";
import { ProductCard } from "@/components/store/product-card";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await db.query.products.findFirst({ where: eq(products.slug, slug), with: { images: { orderBy: (i, { asc }) => asc(i.sortOrder) } } });
  if (!p) return { title: "Produto" };
  const description = (p.description ?? "").split(/\r?\n/)[0].slice(0, 160);
  const img = p.images.find((i) => i.type === "image")?.url;
  return {
    title: p.kind === "custom" ? `${p.name} — personalizado a partir de ${formatBRL(p.priceCents)}` : p.name,
    description,
    alternates: { canonical: `/produtos/${p.slug}` },
    openGraph: { type: "website", title: p.name, description, images: img ? [{ url: img }] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, s, backlog] = await Promise.all([
    db.query.products.findFirst({
      where: eq(products.slug, slug),
      with: {
        images: { orderBy: (i, { asc }) => asc(i.sortOrder) },
        variants: { orderBy: (v, { asc }) => asc(v.sortOrder) },
        category: true,
        material: true,
      },
    }),
    getSettings(),
    getBacklog(),
  ]);
  if (!product || product.status !== "active") notFound();

  const related = await db.query.products.findMany({
    where: and(eq(products.status, "active"), ne(products.id, product.id), product.categoryId ? eq(products.categoryId, product.categoryId) : undefined),
    limit: 4,
    with: { images: { orderBy: (i, { asc }) => asc(i.sortOrder) }, category: true },
  });

  const onSale = !!product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents;
  const off = onSale ? Math.round((1 - product.priceCents / product.compareAtPriceCents!) * 100) : 0;
  const isCustomKind = product.kind === "custom";
  const outOfStock = !isCustomKind && product.stockQty <= 0 && product.variants.every((v) => v.stockQty <= 0);
  // prazo mostrado na página: mesma regra do checkout (impressão + pós-processo + embalagem), para 1 unidade
  const handlingDays = Number(s.shipping_handling_days) || 0;
  const leadDays = estimateProductionDays([{ printMinutes: product.printMinutes, laborMinutes: product.laborMinutes, quantity: 1, inStock: false }], { hoursPerDay: Number(s.production_hours_per_day) || 8, machines: Number(s.production_parallel_machines) || 1, laborHoursPerDay: Number(s.production_labor_hours_per_day) || 4, handlingDays, backlogPrintMinutes: backlog.printMinutes, backlogLaborMinutes: backlog.laborMinutes });
  const wa = whatsappLink(s.shop_whatsapp, `Oi! Tenho uma dúvida sobre "${product.name}" (${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/produtos/${product.slug})`);

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.filter((i) => i.type === "image").map((i) => i.url),
    sku: product.sku ?? undefined,
    category: product.category?.name,
    material: product.material ? `${product.material.type}` : "PLA",
    brand: { "@type": "Brand", name: s.shop_name },
    offers: {
      "@type": "Offer",
      url: `${siteUrl()}/produtos/${product.slug}`,
      priceCurrency: "BRL",
      price: (product.priceCents / 100).toFixed(2),
      ...(isCustomKind ? { priceSpecification: { "@type": "UnitPriceSpecification", priceCurrency: "BRL", price: (product.priceCents / 100).toFixed(2), valueAddedTaxIncluded: true, description: "a partir de" } } : {}),
      availability: isCustomKind || !outOfStock ? "https://schema.org/InStock" : "https://schema.org/MadeToOrder",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${siteUrl()}/#org` },
    },
  };
  const crumbs = breadcrumbLd([{ name: "Início", path: "/" }, { name: "Catálogo", path: "/produtos" }, ...(product.category ? [{ name: product.category.name, path: `/produtos?categoria=${product.category.slug}` }] : []), { name: product.name, path: `/produtos/${product.slug}` }]);

  return (
    <div className="-mt-4 space-y-10 sm:mt-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([productLd, crumbs]) }} />
      <Link href={product.category ? `/produtos?categoria=${product.category.slug}` : "/produtos"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {product.category?.name ?? "Catálogo"}
      </Link>

      <div className="grid gap-6 md:grid-cols-[minmax(0,440px)_1fr] md:gap-10">
        {/* Galeria vertical (sticky no desktop) */}
        <div className="-mx-4 sm:mx-0 md:sticky md:top-24 md:self-start">
          <div className="px-0 sm:px-0">
            <MediaGallery media={product.images} name={product.name} />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap gap-1.5">
              {product.category && <Badge>{product.category.name}</Badge>}
              {product.isCustomizable && <Badge tone="accent">Personalizável</Badge>}
              {product.material && <Badge tone="info">{product.material.type}</Badge>}
              {outOfStock && <Badge tone="warning">Sob encomenda</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">{product.name}</h1>
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold">{isCustomKind && <span className="mr-2 text-base font-normal text-muted-foreground">a partir de</span>}{formatBRL(product.priceCents)}</span>
              {onSale && (
                <>
                  <span className="text-muted-foreground line-through">{formatBRL(product.compareAtPriceCents)}</span>
                  <span className="rounded-full bg-canary px-2.5 py-0.5 text-xs font-bold text-accent-foreground">-{off}%</span>
                </>
              )}
            </div>
          </div>

          <div id="comprar" className={`rounded-3xl border p-4 shadow-xs sm:p-5 ${isCustomKind ? "border-canary bg-canary/40" : "bg-card"}`}>
            {isCustomKind ? (
              <div className="space-y-3">
                <p className="font-display text-lg font-semibold">Feito do seu jeito</p>
                <p className="text-sm text-muted-foreground">Este item é produzido sob medida. Conte os detalhes da sua versão e receba um orçamento em até 2 dias úteis — o briefing já vem pré-preenchido.</p>
                {product.quoteBrief && <pre className="whitespace-pre-wrap rounded-xl bg-white/70 p-3 font-sans text-xs text-muted-foreground">{product.quoteBrief}</pre>}
                <Link href={`/projetos?produto=${product.slug}`} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground font-semibold text-blush transition-transform hover:scale-[1.02]"><Sparkles className="size-4" /> Pedir orçamento deste item</Link>
              </div>
            ) : (
              <>
                <AddToCartForm product={product} variants={product.variants} />
                <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <Clock className="mt-0.5 size-3.5 shrink-0" />
                  {outOfStock ? `Impresso após o pedido: pronto em ~${leadDays} dia${leadDays === 1 ? "" : "s"} úteis (impressão + acabamento + embalagem).` : handlingDays > 0 ? `Em estoque — sai em até ${handlingDays} dia${handlingDays === 1 ? "" : "s"} úteis.` : "Em estoque — sai no mesmo dia."}
                </p>
              </>
            )}
          </div>
          {!isCustomKind && <ShippingCalculator single={{ productId: product.id }} compact className="mt-4" />}

          {product.description && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">Sobre a peça</h2>
              <p className="whitespace-pre-line text-muted-foreground">{product.description}</p>
            </div>
          )}

          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li className="flex items-center gap-2 rounded-2xl bg-custard/60 p-3"><Layers className="size-4" /> {product.material ? `${product.material.name}` : "Impressão 3D em filamento"}</li>
            <li className="flex items-center gap-2 rounded-2xl bg-rose/60 p-3"><Truck className="size-4" /> Retirada ou envio com rastreio</li>
            <li className="flex items-center gap-2 rounded-2xl bg-blush p-3"><ShieldCheck className="size-4" /> Feito sob demanda com carinho</li>
            <li className="flex items-center gap-2 rounded-2xl bg-powder/60 p-3"><Sparkles className="size-4" /> Quer outra cor ou medida? <Link href="/projetos" className="font-medium underline">Personalize</Link></li>
          </ul>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            {product.sku && (<><dt className="text-muted-foreground">Código</dt><dd>{product.sku}</dd></>)}
            {product.printMinutes > 0 && (<><dt className="text-muted-foreground">Tempo de impressão</dt><dd>{Math.round((product.printMinutes / 60) * 10) / 10} h por unidade</dd></>)}
            {product.materialGrams > 0 && (<><dt className="text-muted-foreground">Peso aproximado</dt><dd>{product.materialGrams} g</dd></>)}
          </dl>

          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border bg-card px-5 text-sm font-medium hover:bg-muted">
              Tirar dúvida no WhatsApp
            </a>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Você também pode gostar</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </section>
      )}

      {/* CTA fixo no mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 p-3 backdrop-blur md:hidden">
        <a href={isCustomKind ? `/projetos?produto=${product.slug}` : "#comprar"} className="flex h-12 items-center justify-between rounded-full bg-foreground px-5 font-semibold text-blush">
          <span>{isCustomKind ? "a partir de " : ""}{formatBRL(product.priceCents)}</span>
          <span>{isCustomKind ? "Pedir orçamento" : "Comprar"}</span>
        </a>
      </div>
      <div className="h-16 md:hidden" />
    </div>
  );
}
