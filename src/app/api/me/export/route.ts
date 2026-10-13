import { NextResponse } from "next/server";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { addresses, consents, customers, interactions, orders, quoteMessages, quotes, tickets, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { PRIVACY_VERSION, recordConsent } from "@/lib/security";

/**
 * Portabilidade (LGPD art. 18, V): o titular baixa na hora, em JSON, tudo que temos sobre ele.
 * Sem passar pelo suporte. Fica registrado em `consents` (export_request) para prestação de contas.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Faça login para exportar seus dados" }, { status: 401 });
  const email = (session.user.email ?? "").toLowerCase();

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { id: true, name: true, email: true, phone: true, document: true, image: true, role: true, createdAt: true } });
  const myAddresses = await db.query.addresses.findMany({ where: eq(addresses.userId, session.user.id) });
  const customer = email ? await db.query.customers.findFirst({ where: eq(customers.email, email), with: { addresses: true } }) : null;
  const myOrders = await db.query.orders.findMany({ where: or(eq(orders.userId, session.user.id), eq(orders.customerEmail, email)), orderBy: desc(orders.createdAt), with: { items: true, events: true } });
  const myQuotes = await db.query.quotes.findMany({
    where: customer ? or(eq(quotes.userId, session.user.id), eq(quotes.customerId, customer.id)) : eq(quotes.userId, session.user.id),
    orderBy: desc(quotes.createdAt),
  });
  const quoteIds = myQuotes.map((q) => q.id);
  const messages = quoteIds.length ? await db.query.quoteMessages.findMany({ where: inArray(quoteMessages.quoteId, quoteIds) }) : [];
  const myTickets = await db.query.tickets.findMany({ where: or(eq(tickets.userId, session.user.id), eq(tickets.email, email)), with: { messages: true } });
  const myConsents = await db.query.consents.findMany({ where: eq(consents.email, email), orderBy: desc(consents.createdAt) });
  const crmNotes = customer ? await db.query.interactions.findMany({ where: eq(interactions.customerId, customer.id) }) : [];

  await recordConsent({ type: "export_request", version: PRIVACY_VERSION, email, userId: session.user.id, meta: { delivered: "self-service-json" } });

  const payload = {
    exportadoEm: new Date().toISOString(),
    titular: user,
    enderecos: myAddresses,
    cadastroCliente: customer,
    pedidos: myOrders.map((o) => ({ ...o, accessToken: undefined })),
    orcamentos: myQuotes.map((q) => ({ ...q, accessToken: undefined })),
    mensagensOrcamentos: messages.filter((m) => !m.isInternal),
    chamados: myTickets.map(({ messages, ...t }) => ({ ...t, accessToken: undefined, mensagens: messages.filter((m) => !m.isInternal) })),
    registrosDeContato: crmNotes.map((n) => ({ tipo: n.type, data: n.createdAt })),
    consentimentos: myConsents,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-ahlstudio-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
