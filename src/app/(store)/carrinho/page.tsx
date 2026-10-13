import Image from "next/image";
import Link from "next/link";
import { Box, Sparkles, Trash2 } from "lucide-react";
import { lineKey } from "@/lib/cart";
import { quoteCart } from "@/lib/shipping-quote";
import { ShippingCalculator } from "@/components/store/shipping-calculator";
import { formatBRL } from "@/lib/money";
import { removeFromCartAction, updateCartQtyAction } from "@/actions/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Carrinho" };

export default async function CartPage() {
  const { cart, quote } = await quoteCart();

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold">Seu carrinho está vazio</h1>
        <p className="mt-2 text-muted-foreground">Dê uma olhada no catálogo ou peça um projeto personalizado.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/produtos" className="inline-flex h-10 items-center rounded-lg bg-powder px-4 text-sm font-semibold hover:bg-primary-strong">Ver catálogo</Link>
          <Link href="/projetos" className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted">Projeto personalizado</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Carrinho</h1>
        <ul className="divide-y rounded-2xl border bg-card">
          {cart.items.map((item) => {
            const key = lineKey(item);
            return (
              <li key={key} className="flex gap-4 p-4">
                <div className={`relative size-20 shrink-0 overflow-hidden rounded-xl border ${item.isCustom ? "bg-canary" : "bg-blush"}`}>
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.name} fill sizes="80px" className="object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">{item.isCustom ? <Sparkles className="text-accent-foreground" /> : <Box />}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={item.href} className="font-medium hover:underline">{item.name}</Link>
                  {item.isCustom && <span className="ml-2 rounded-full bg-canary px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">exclusivo seu</span>}
                  {item.variantLabel && <p className="text-sm text-muted-foreground">{item.variantLabel}</p>}
                  {item.customization && <p className="mt-1 truncate text-xs text-muted-foreground">Personalização: {item.customization}</p>}
                  {!item.isCustom && <p className="mt-1 text-sm text-muted-foreground">{formatBRL(item.unitPriceCents)} / un.</p>}
                </div>
                <div className="flex flex-col items-end justify-between gap-2">
                  <p className="font-semibold">{formatBRL(item.totalCents)}</p>
                  <div className="flex items-center gap-2">
                    {!item.isCustom && (
                      <form action={updateCartQtyAction} className="flex items-center gap-1">
                        <input type="hidden" name="key" value={key} />
                        <Input type="number" name="quantity" min={0} max={99} defaultValue={item.quantity} className="h-8 w-16 px-2 text-center" />
                        <Button variant="outline" size="sm" type="submit">OK</Button>
                      </form>
                    )}
                    <form action={removeFromCartAction}>
                      <input type="hidden" name="key" value={key} />
                      <Button variant="ghost" size="icon" type="submit" aria-label="Remover"><Trash2 className="text-muted-foreground" /></Button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="h-fit rounded-2xl border bg-card p-5 lg:sticky lg:top-24">
        <h2 className="font-semibold">Resumo</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal ({cart.count} item{cart.count > 1 ? "s" : ""})</dt><dd>{formatBRL(cart.subtotalCents)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Frete</dt><dd className="text-muted-foreground">{quote.cep ? "veja as opções abaixo" : "calcule pelo CEP"}</dd></div>
        </dl>
        <ShippingCalculator initialCep={quote.cep} initialQuote={quote} compact className="mt-4" />
        <Link href="/checkout" className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground text-base font-semibold text-blush hover:scale-[1.02]">
          Finalizar compra
        </Link>
        <Link href="/produtos" className="mt-2 block text-center text-sm text-muted-foreground hover:text-foreground">Continuar comprando</Link>
      </aside>
    </div>
  );
}
