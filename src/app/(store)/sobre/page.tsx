import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart, MapPin, PencilRuler, Recycle, Sparkles, Truck } from "lucide-react";
import { getSettings, whatsappLink } from "@/lib/settings";
import { breadcrumbLd, jsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sobre o studio",
  description: "Quem faz, como faz e onde fica o AHL Studio: impressão 3D artesanal em Americana/SP, com bonecos e chaveiros personalizados de pets e pessoas, e peças com NFC para comércios.",
  alternates: { canonical: "/sobre" },
};

export default async function AboutPage() {
  const s = await getSettings();
  const wa = whatsappLink(s.shop_whatsapp, `Olá! Vim pela página Sobre do site da ${s.shop_name}.`);
  const steps = [
    { icon: PencilRuler, title: "Você conta a ideia", text: "Fotos do pet, da pessoa ou o logo do seu negócio. Quanto mais detalhe, mais fiel fica." },
    { icon: Sparkles, title: "A gente modela e mostra a prévia", text: "Em até 2 dias úteis você recebe preço, prazo e uma prévia para aprovar antes de imprimir." },
    { icon: Heart, title: "Impressão + acabamento à mão", text: "PLA de qualidade, pintura manual quando é boneco ou chaveiro, verniz de proteção e embalagem bonita." },
    { icon: Truck, title: "Retirada ou entrega", text: "Retire no studio, receba em casa na região de Americana ou por Correios/Jadlog em todo o Brasil." },
  ];
  return (
    <div className="space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd([{ name: "Início", path: "/" }, { name: "Sobre", path: "/sobre" }])) }} />
      <section className="grid items-center gap-8 md:grid-cols-[1fr_320px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sobre</p>
          <h1 className="mt-2 text-4xl font-semibold md:text-5xl">Um studio de impressão 3D que faz peças com carinho, camada por camada.</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            O {s.shop_name} nasceu em {s.shop_city || "Americana"}/{s.shop_state || "SP"} para transformar quem você ama — o pet, a família, a sua marca — em peças únicas: bonecos estilo Funko, chaveiros e itens com NFC que trabalham pelo seu negócio. Cada peça é modelada a partir das suas fotos, impressa em PLA e finalizada à mão.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/projetos" className="inline-flex h-11 items-center rounded-full bg-foreground px-5 font-semibold text-blush hover:scale-[1.02]">Pedir um orçamento</Link>
            <Link href="/produtos" className="inline-flex h-11 items-center rounded-full border px-5 font-medium hover:bg-muted">Ver catálogo</Link>
          </div>
        </div>
        <Image src="/brand/logo-full.png" alt={s.shop_name} width={320} height={326} className="mx-auto h-auto w-56 md:w-72" priority />
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Como funciona</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-4">
          {steps.map((st, i) => (
            <li key={st.title} className="rounded-3xl border bg-card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><span className="grid size-7 place-items-center rounded-full bg-powder text-foreground">{i + 1}</span><st.icon className="size-4" /></div>
              <p className="mt-3 font-semibold">{st.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{st.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-custard/60 p-5">
          <p className="flex items-center gap-2 font-semibold"><MapPin className="size-4" /> Onde estamos</p>
          <p className="mt-2 text-sm text-muted-foreground">{s.shop_city || "Americana"}/{s.shop_state || "SP"}. Entrega própria em Americana, Santa Bárbara d&apos;Oeste, Nova Odessa, Sumaré, Hortolândia, Limeira, Paulínia e Cosmópolis. Envio para todo o Brasil.</p>
        </div>
        <div className="rounded-3xl bg-rose/60 p-5">
          <p className="flex items-center gap-2 font-semibold"><Recycle className="size-4" /> Material</p>
          <p className="mt-2 text-sm text-muted-foreground">PLA, um bioplástico feito de amido de milho: leve, resistente e com acabamento fosco bonito. Pintura acrílica à mão e verniz de proteção nas peças decorativas.</p>
        </div>
        <div className="rounded-3xl bg-blush p-5">
          <p className="flex items-center gap-2 font-semibold"><Heart className="size-4" /> Feito sob demanda</p>
          <p className="mt-2 text-sm text-muted-foreground">Produzimos o que você pede, sem estoque parado e sem desperdício. Você acompanha o prazo de produção e a entrega pelo site.</p>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Fale com a gente</p>
        <p className="mt-1">
          {s.shop_email && <>E-mail: <a href={`mailto:${s.shop_email}`} className="underline">{s.shop_email}</a> · </>}
          {wa && <><a href={wa} target="_blank" rel="noreferrer noopener" className="underline">WhatsApp</a> · </>}
          <Link href="/ajuda" className="underline">Central de ajuda</Link>
          {s.shop_legal_name && <> · {s.shop_legal_name}{s.shop_cnpj ? ` · CNPJ/CPF ${s.shop_cnpj}` : ""}</>}
        </p>
      </section>
    </div>
  );
}
