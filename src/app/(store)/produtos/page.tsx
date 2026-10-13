import Link from "next/link";
import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { tagLabel } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ProductCard } from "@/components/store/product-card";

export const metadata = { title: "Catálogo de peças em 3D", description: "Bonecos, chaveiros e peças com NFC personalizados, com preço a partir de e cálculo de frete pelo CEP.", alternates: { canonical: "/produtos" } };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ categoria?: string; q?: string; tag?: string; personalizavel?: string }> }) {
  const { categoria, q, tag, personalizavel } = await searchParams;
  const cats = await db.query.categories.findMany({ orderBy: asc(categories.sortOrder) });
  const activeCat = categoria ? cats.find((c) => c.slug === categoria) : null;

  const where = and(
    eq(products.status, "active"),
    activeCat ? eq(products.categoryId, activeCat.id) : undefined,
    q ? or(like(products.name, `%${q}%`), like(products.description, `%${q}%`)) : undefined,
    // tags são JSON array: busca pelo literal "tag" dentro do texto
    tag ? like(products.tags, `%"${tag}"%`) : undefined,
    personalizavel ? or(eq(products.isCustomizable, true), eq(products.kind, "custom")) : undefined,
  );

  const list = await db.query.products.findMany({
    where,
    orderBy: [desc(products.featured), asc(products.name)],
    with: { images: { orderBy: (i, { asc }) => asc(i.sortOrder) }, category: true },
  });

  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <aside className="space-y-6">
        <form className="md:hidden">
          <Input name="q" defaultValue={q} placeholder="Buscar produto…" />
        </form>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias</p>
          <ul className="space-y-1 text-sm">
            <li>
              <Link href="/produtos" className={cn("block rounded-md px-2 py-1.5 hover:bg-muted", !activeCat && "bg-muted font-medium")}>Todas</Link>
            </li>
            {cats.map((c) => (
              <li key={c.id}>
                <Link href={`/produtos?categoria=${c.slug}`} className={cn("block rounded-md px-2 py-1.5 hover:bg-muted", activeCat?.id === c.id && "bg-muted font-medium")}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{personalizavel ? "Personalizáveis" : tag ? tagLabel(tag) : activeCat?.name ?? "Catálogo"}</h1>
            {activeCat?.description && <p className="text-sm text-muted-foreground">{activeCat.description}</p>}
          </div>
          <form className="hidden md:block">
            {categoria && <input type="hidden" name="categoria" value={categoria} />}
            <Input name="q" defaultValue={q} placeholder="Buscar produto…" className="w-64" />
          </form>
        </div>
        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">Nenhum produto encontrado.</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {list.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </section>
    </div>
  );
}
