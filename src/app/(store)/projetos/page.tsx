import { FileBox, MessageSquareText, Printer, ShieldCheck } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { auth } from "@/lib/auth";
import { QuoteForm, type QuotePrefill } from "@/components/store/quote-form";

export const metadata = { title: "Projeto personalizado", alternates: { canonical: "/projetos" } };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  const session = await auth();

  // Item personalizado do catálogo pré-preenche o briefing
  let prefill: QuotePrefill | undefined;
  if (produto) {
    const p = await db.query.products.findFirst({ where: and(eq(products.slug, produto), eq(products.status, "active")), with: { material: true } });
    if (p) {
      prefill = {
        productId: p.id,
        productName: p.name,
        title: p.name,
        description: p.quoteBrief ?? p.customizationHint ?? "",
        quantity: 1,
        desiredMaterial: p.material?.type,
      };
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{prefill ? `Personalizar: ${prefill.productName}` : "Projeto personalizado"}</h1>
        <p className="mt-2 text-muted-foreground">
          Quanto mais detalhes, mais rápido chega o orçamento — normalmente em até 2 dias úteis. Sem compromisso.
        </p>
        <div className="mt-8 rounded-3xl border bg-card p-5 sm:p-7">
          <QuoteForm defaults={{ name: session?.user?.name, email: session?.user?.email }} prefill={prefill} />
        </div>
      </div>
      <aside className="space-y-3 lg:pt-16">
        {[
          { icon: MessageSquareText, title: "1. Você descreve", text: "Ideia, fotos ou arquivo 3D (STL/3MF) por link.", bg: "bg-blush" },
          { icon: FileBox, title: "2. Orçamento", text: "Analisamos viabilidade, material e tempo e enviamos o preço aqui e no WhatsApp.", bg: "bg-custard" },
          { icon: Printer, title: "3. Aprovou? Produzimos", text: "O item entra no seu carrinho como produto exclusivo; você paga e acompanha pelo site.", bg: "bg-rose" },
          { icon: ShieldCheck, title: "Seus arquivos são seus", text: "Usamos referências e modelos só para o seu pedido, nunca para revenda.", bg: "bg-powder" },
        ].map((s, i) => (
          <div key={s.title} style={{ "--i": i } as React.CSSProperties} className={`stagger flex gap-3 rounded-2xl p-4 text-sm ${s.bg}`}>
            <s.icon className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">{s.title}</p>
              <p className="text-foreground/70">{s.text}</p>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
