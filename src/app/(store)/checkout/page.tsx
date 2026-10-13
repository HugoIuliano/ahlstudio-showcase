import Image from "next/image";
import { redirect } from "next/navigation";
import { Box, Sparkles } from "lucide-react";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { addresses, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isMercadoPagoEnabled } from "@/lib/mercadopago";
import { formatBRL } from "@/lib/money";
import { quoteCart } from "@/lib/shipping-quote";
import { CheckoutForm } from "@/components/store/checkout-form";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const session = await auth();
  const [user, myAddresses] = session?.user?.id
    ? await Promise.all([
        db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { name: true, email: true, phone: true } }),
        db.query.addresses.findMany({ where: eq(addresses.userId, session.user.id), orderBy: [desc(addresses.isDefault), asc(addresses.createdAt)] }),
      ])
    : [null, []];

  // sem CEP no cookie, cota já com o endereço principal do cliente
  const defaultZip = myAddresses.find((a) => a.isDefault)?.zip ?? myAddresses[0]?.zip ?? null;
  const { quote, pref, cart } = await quoteCart(undefined);
  const effective = quote.cep || !defaultZip ? { quote, pref, cart } : { ...(await quoteCart(defaultZip)), pref };
  if (effective.cart.items.length === 0) redirect("/carrinho");
  const hasCustom = effective.cart.items.some((i) => i.isCustom);

  const paymentLabel = isMercadoPagoEnabled()
    ? "Mercado Pago (PIX, cartão ou boleto) — você será redirecionado"
    : "PIX — a chave aparece na confirmação do pedido";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Finalizar compra</h1>
        <CheckoutForm
          subtotalCents={effective.cart.subtotalCents}
          initialQuote={effective.quote}
          initialOptionId={pref.optionId}
          addresses={myAddresses}
          defaults={{ name: user?.name ?? session?.user?.name, email: user?.email ?? session?.user?.email, phone: user?.phone }}
          paymentLabel={paymentLabel}
          lockEmail={hasCustom && !!session?.user?.email}
          loggedIn={!!session?.user}
        />
      </div>
      <aside className="h-fit rounded-2xl border bg-card p-5 lg:sticky lg:top-24">
        <h2 className="font-semibold">Itens ({effective.cart.count})</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {effective.cart.items.map((i) => (
            <li key={`${i.productId}-${i.quoteId}-${i.variantId}-${i.customization}`} className="flex gap-3">
              <div className={`relative size-12 shrink-0 overflow-hidden rounded-lg border ${i.isCustom ? "bg-canary" : "bg-blush"}`}>
                {i.imageUrl ? <Image src={i.imageUrl} alt={i.name} fill sizes="48px" className="object-cover" /> : <div className="grid h-full place-items-center text-muted-foreground">{i.isCustom ? <Sparkles className="size-4 text-accent-foreground" /> : <Box className="size-4" />}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.name}</p>
                <p className="text-muted-foreground">{i.isCustom ? i.variantLabel : `${i.quantity} × ${formatBRL(i.unitPriceCents)}${i.variantLabel ? ` · ${i.variantLabel}` : ""}`}</p>
              </div>
              <span>{formatBRL(i.totalCents)}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
