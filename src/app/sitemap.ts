import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = siteUrl();
  const now = new Date();
  const statics: MetadataRoute.Sitemap = [
    { url: `${url}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${url}/produtos`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${url}/projetos`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${url}/sobre`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${url}/ajuda`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${url}/termos`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${url}/privacidade`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
  const list = await db.query.products.findMany({ where: eq(products.status, "active"), columns: { slug: true, updatedAt: true } });
  return [...statics, ...list.map((p) => ({ url: `${url}/produtos/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 }))];
}
