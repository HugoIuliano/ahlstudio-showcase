import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { requestMeta } from "./security";

export class RateLimitError extends Error {
  constructor(public readonly key: string) {
    super("rate_limited");
  }
}

/**
 * Limite por janela fixa persistido no banco (funciona com várias instâncias).
 * Lança RateLimitError quando `max` é excedido dentro de `windowMs`.
 *   assertRateLimit("login:email:x@y", 10, 15*60_000)
 *   assertRateLimit("signup:ip", 5, 60*60_000, { byIp: true })  // chave vira signup:ip:<ip>
 */
export async function assertRateLimit(key: string, max: number, windowMs: number, opts?: { byIp?: boolean }) {
  let fullKey = key;
  if (opts?.byIp) {
    const { ip } = await requestMeta();
    fullKey = `${key}:${ip ?? "unknown"}`;
  }
  const now = Date.now();
  const windowStart = new Date(now - (now % windowMs));

  // upsert: nova janela zera; mesma janela incrementa
  await db
    .insert(rateLimits)
    .values({ key: fullKey, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} = ${windowStart.getTime()} then ${rateLimits.count} + 1 else 1 end`,
        windowStart,
      },
    });
  const row = await db.query.rateLimits.findFirst({ where: (r, { eq }) => eq(r.key, fullKey) });
  if ((row?.count ?? 0) > max) throw new RateLimitError(fullKey);
}
