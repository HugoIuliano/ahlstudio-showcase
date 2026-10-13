import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, quoteMessages, ticketMessages } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canAccessQuote, canAccessTicket } from "@/lib/security";

/**
 * Serve um anexo com a MESMA regra de acesso do orçamento/chamado ao qual pertence.
 * Nunca é público: exige dono logado, token do link (?t=) ou admin.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("t");
  const file = await db.query.attachments.findFirst({ where: eq(attachments.id, id) });
  if (!file) return new NextResponse("Not found", { status: 404 });

  const session = await auth();
  let allowed = false;
  if (file.refType === "quote_message") {
    const msg = await db.query.quoteMessages.findFirst({ where: eq(quoteMessages.id, file.refId), with: { quote: { with: { customer: true } } } });
    allowed = !!msg && canAccessQuote(msg.quote, session?.user, token);
  } else if (file.refType === "ticket_message") {
    const msg = await db.query.ticketMessages.findFirst({ where: eq(ticketMessages.id, file.refId), with: { ticket: true } });
    allowed = !!msg && canAccessTicket(msg.ticket, session?.user, token);
  }
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const dangerous = /svg|html|xml|javascript/i.test(file.mime);
  const inline = !dangerous && (file.mime.startsWith("image/") || file.mime.startsWith("video/") || file.mime === "application/pdf");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": dangerous ? "application/octet-stream" : file.mime,
      // isola o conteúdo mesmo se aberto direto: sem scripts, sem acesso à origem
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
