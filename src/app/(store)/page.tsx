import Link from "next/link";
import { ArrowRight, FileBox, Heart, MessageSquareText, PencilRuler, Printer, Sparkles, Truck } from "lucide-react";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { getSettings, whatsappLink } from "@/lib/settings";
import { thumbUrl } from "@/lib/media";
import { FEATURED_TAG, KNOWN_TAGS, sortTags, tagLabel } from "@/lib/tags";
import { HeroCarousel, type HeroSlide } from "@/components/store/hero-carousel";
import { ProductCard } from "@/components/store/product-card";
import { ProductRail } from "@/components/store/product-rail";

export const metadata = {
  title: "AHL Studio — Impressão 3D personalizada em Americana/SP",
  description: "Bonecos estilo Funko do seu pet ou de quem você ama, chaveiros personalizados e peças com NFC para o seu comércio. Feito em Americana/SP, entrega local e envio para todo o Brasil.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [s, all, cats] = await Promise.all([
    getSettings(),
    db.query.products.findMany({
      where: eq(products.status, "active"),
      orderBy: [desc(products.featured), desc(products.createdAt)],
      with: { images: { orderBy: (i, { asc }) => asc(i.sortOrder) }, category: true },
    }),
    db.query.categories.findMany({ orderBy: asc(categories.sortOrder) }),
  ]);

  // Hero: tag "destaques" (fallback: flag featured)
  const tagged = all.filter((p) => p.tags.includes(FEATURED_TAG));
  const heroProducts = (tagged.length ? tagged : all.filter((p) => p.featured)).slice(0, 6);
  const slides: HeroSlide[] = heroProducts.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    priceCents: p.priceCents,
    compareAtPriceCents: p.compareAtPriceCents,
    imageUrl: thumbUrl(p.images),
    categoryName: p.category?.name ?? null,
    tags: p.tags,
  }));

  // Seções dinâmicas por tag (exceto destaques)
  const tagSet = new Set<string>();
  for (const p of all) for (const t of p.tags) if (t !== FEATURED_TAG) tagSet.add(t);
  const sections = sortTags([...tagSet]).map((tag) => ({
    tag,
    title: tagLabel(tag),
    subtitle: KNOWN_TAGS[tag]?.subtitle,
    tone: KNOWN_TAGS[tag]?.tone ?? "neutral",
    items: all.filter((p) => p.tags.includes(tag)).slice(0, 12),
  }));
  const customizable = all.filter((p) => p.kind === "custom" || p.isCustomizable).sort((a, b) => Number(b.kind === "custom") - Number(a.kind === "custom")).slice(0, 12);
  const wa = whatsappLink(s.shop_whatsapp, "Oi! Quero conversar sobre uma peça personalizada.");

  return (
    <div className="space-y-14">
      {/* ===== HERO: carrossel de destaques + card de personalizados lado a lado ===== */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {slides.length > 0 ? (
          <HeroCarousel slides={slides} />
        ) : (
          <section className="animate-fade-up flex flex-col justify-center rounded-3xl bg-gradient-to-br from-rose via-blush to-custard p-8 md:p-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{s.shop_tagline}</p>
            <h1 className="mt-2 max-w-xl text-4xl font-semibold md:text-5xl">Peças fofas, feitas com carinho, camada por camada.</h1>
            <Link href="/produtos" className="mt-6 inline-flex h-12 w-fit items-center gap-2 rounded-full bg-foreground px-6 font-semibold text-blush transition-transform hover:scale-[1.03]">Ver catálogo <ArrowRight className="size-4" /></Link>
          </section>
        )}

        <Link href="/projetos" className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-canary p-7 text-accent-foreground transition-transform hover:-translate-y-1 hover:shadow-lg" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-white/40 blur-2xl transition-transform group-hover:scale-125" />
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-bold"><Sparkles className="size-3.5" /> Sob medida</span>
            <h2 className="mt-4 text-3xl font-semibold leading-tight">Tem uma ideia? A gente imprime.</h2>
            <p className="mt-2 text-sm text-accent-foreground/80">Nome gravado, peça de reposição, presente único, protótipo… Descreva e receba um orçamento em até 2 dias úteis.</p>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <span className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-blush transition-transform group-hover:scale-[1.04]">Pedir orçamento <ArrowRight className="size-4" /></span>
            <PencilRuler className="size-10 text-accent-foreground/40 transition-transform group-hover:rotate-12" />
          </div>
        </Link>
      </div>

      {/* Chips de categorias */}
      {cats.length > 0 && (
        <div className="rail -mx-4 px-4">
          <Link href="/produtos" className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-blush">Tudo</Link>
          {cats.map((c) => (
            <Link key={c.id} href={`/produtos?categoria=${c.slug}`} className="rounded-full border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-rose">{c.name}</Link>
          ))}
          <Link href="/projetos" className="inline-flex items-center gap-1.5 rounded-full bg-canary px-4 py-2 text-sm font-semibold text-accent-foreground"><Sparkles className="size-4" /> Personalizados</Link>
        </div>
      )}

      {/* ===== PERSONALIZADOS: seção grande ===== */}
      <section className="overflow-hidden rounded-3xl border bg-card">
        <div className="grid gap-8 p-8 md:grid-cols-2 md:p-12">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose px-3 py-1 text-xs font-bold"><Heart className="size-3.5" /> Nosso carro-chefe</span>
            <h2 className="mt-4 text-3xl font-semibold md:text-4xl">Personalizados do seu jeito</h2>
            <p className="mt-3 text-muted-foreground">
              A maior parte do que fazemos nasce de uma conversa. Você conta a ideia — pode ser um rabisco, uma foto ou um arquivo 3D — e a gente modela, imprime e entrega. Sem mínimo de quantidade.
            </p>
            <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
              {["Nome ou frase gravada", "Peça de reposição que não existe mais", "Brindes para eventos e empresas", "Protótipos e suportes técnicos", "Toppers, chaveiros e lembrancinhas", "Decoração com a sua cara"].map((t, i) => (
                <li key={t} style={{ "--i": i } as React.CSSProperties} className="stagger flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary-strong" />{t}</li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/projetos" className="inline-flex h-12 items-center gap-2 rounded-full bg-powder px-6 font-semibold transition-transform hover:scale-[1.03] hover:bg-primary-strong">Pedir orçamento grátis <ArrowRight className="size-4" /></Link>
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center rounded-full border bg-card px-6 font-semibold hover:bg-muted">Falar no WhatsApp</a>}
            </div>
          </div>
          <ol className="grid gap-3 self-center">
            {[
              { icon: MessageSquareText, title: "1. Você descreve", text: "Envie a ideia, fotos ou um arquivo 3D (STL/3MF) por link.", bg: "bg-blush" },
              { icon: FileBox, title: "2. Orçamento em até 2 dias", text: "Analisamos viabilidade, material e tempo e enviamos o preço.", bg: "bg-custard" },
              { icon: Printer, title: "3. Aprovou? Imprimimos", text: "Entra na fila de produção e você acompanha tudo pelo site.", bg: "bg-rose" },
              { icon: Truck, title: "4. Retire ou receba", text: "Retirada na loja ou envio com rastreio.", bg: "bg-powder" },
            ].map((st, i) => (
              <li key={st.title} style={{ "--i": i + 2 } as React.CSSProperties} className={`stagger flex gap-4 rounded-2xl p-4 ${st.bg}`}>
                <st.icon className="mt-0.5 size-6 shrink-0" />
                <div>
                  <p className="font-display font-semibold">{st.title}</p>
                  <p className="text-sm text-foreground/70">{st.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Produtos personalizáveis do catálogo */}
      {customizable.length > 0 && (
        <ProductRail title="Personalize do seu jeito" subtitle="Produtos do catálogo que aceitam nome, cor ou ajuste" tone="canary" href="/produtos?personalizavel=1">
          {customizable.map((p, i) => <ProductCard key={p.id} product={p} index={i} className="w-[46vw] sm:w-56 md:w-60" />)}
        </ProductRail>
      )}

      {/* Seções dinâmicas por tag */}
      {sections.map((sec) => (
        <ProductRail key={sec.tag} title={sec.title} subtitle={sec.subtitle} tone={sec.tone} href={`/produtos?tag=${sec.tag}`}>
          {sec.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} className="w-[46vw] sm:w-56 md:w-60" />)}
        </ProductRail>
      ))}

      {all.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-2xl font-semibold">Catálogo</h2>
            <Link href="/produtos" className="text-sm font-medium text-muted-foreground hover:text-foreground">Ver tudo →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {all.slice(0, 8).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </section>
      )}

      {all.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Nenhum produto publicado ainda. <Link href="/admin/produtos" className="underline">Cadastre o primeiro no painel.</Link>
        </div>
      )}

      {/* CTA final */}
      <section className="relative overflow-hidden rounded-3xl bg-foreground p-8 text-blush md:p-12">
        <div className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-canary/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 size-48 rounded-full bg-powder/30 blur-3xl" />
        <h2 className="text-3xl font-semibold">Ainda na dúvida se dá pra imprimir?</h2>
        <p className="mt-2 max-w-xl text-blush/70">Manda a ideia mesmo assim. Se não der em 3D, a gente te fala — e se der, você recebe um orçamento sem compromisso.</p>
        <Link href="/projetos" className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-canary px-6 font-semibold text-accent-foreground transition-transform hover:scale-[1.03]">
          Quero um orçamento <ArrowRight className="size-4" />
        </Link>
      </section>
    </div>
  );
}
