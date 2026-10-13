/**
 * Seed de desenvolvimento: admin, categorias, materiais, impressora e produtos de exemplo.
 * Uso: npm run db:seed   (idempotente: não duplica se já existir)
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import * as schema from "./schema";
import { generateStrongPassword } from "../lib/password";
import { DEFAULT_ZONES } from "../lib/shipping";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const db = drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined }), { schema });

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@ahlstudio.com").toLowerCase();
  // Nunca use senha fraca: sem SEED_ADMIN_PASSWORD geramos uma forte e imprimimos uma única vez.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || generateStrongPassword(18);

  // Admin
  const existingAdmin = await db.query.users.findFirst({ where: eq(schema.users.email, adminEmail) });
  if (!existingAdmin) {
    await db.insert(schema.users).values({ name: "Admin", email: adminEmail, passwordHash: await hash(adminPassword, 10), role: "admin" });
    console.log(`✔ admin criado: ${adminEmail} / ${adminPassword}`);
  } else if (existingAdmin.role !== "admin") {
    await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, existingAdmin.id));
    console.log(`✔ ${adminEmail} promovido a admin`);
  } else {
    console.log(`• admin já existe: ${adminEmail}`);
  }

  // Materiais
  const materialsSeed = [
    { name: "PLA Preto", type: "PLA", brand: "Voolt", color: "Preto", colorHex: "#1c1c1c", costPerKgCents: 11900, stockGrams: 2000 },
    { name: "PLA Branco", type: "PLA", brand: "Voolt", color: "Branco", colorHex: "#f5f5f5", costPerKgCents: 11900, stockGrams: 1500 },
    { name: "PLA Rosa", type: "PLA", brand: "3D Fila", color: "Rosa", colorHex: "#f4afab", costPerKgCents: 12900, stockGrams: 800 },
    { name: "PETG Transparente", type: "PETG", brand: "3D Lab", color: "Transparente", colorHex: "#dfe9f0", costPerKgCents: 14900, stockGrams: 600 },
    { name: "TPU Amarelo", type: "TPU", brand: "Cliever", color: "Amarelo", colorHex: "#f4f482", costPerKgCents: 19900, stockGrams: 150 },
  ] as const;
  const matIds: Record<string, string> = {};
  for (const m of materialsSeed) {
    const found = await db.query.materials.findFirst({ where: eq(schema.materials.name, m.name) });
    if (found) { matIds[m.name] = found.id; continue; }
    const [row] = await db.insert(schema.materials).values({ ...m, minStockGrams: 200 }).returning();
    await db.insert(schema.stockMovements).values({ materialId: row.id, deltaGrams: m.stockGrams, reason: "purchase", unitCostCents: m.costPerKgCents, note: "Estoque inicial (seed)" });
    matIds[m.name] = row.id;
  }
  console.log(`✔ ${materialsSeed.length} materiais`);

  // Impressoras
  if (!(await db.query.printers.findFirst())) {
    await db.insert(schema.printers).values([
      { name: "Ender 3 V3 SE", model: "Creality Ender 3 V3 SE", bedSize: "220x220x250", hourlyCostCents: 120 },
      { name: "Bambu A1 mini", model: "Bambu Lab A1 mini", bedSize: "180x180x180", hourlyCostCents: 150 },
    ]);
    console.log("✔ 2 impressoras");
  }

  // Categorias
  const catsSeed = [
    { name: "Decoração", slug: "decoracao", description: "Vasos, luminárias e enfeites", sortOrder: 1 },
    { name: "Organização", slug: "organizacao", description: "Suportes, porta-trecos e organizadores", sortOrder: 2 },
    { name: "Presentes", slug: "presentes", description: "Chaveiros, miniaturas e peças personalizadas", sortOrder: 3 },
    { name: "Tech & gadgets", slug: "tech", description: "Suportes para celular, cabos e periféricos", sortOrder: 4 },
  ];
  const catIds: Record<string, string> = {};
  for (const c of catsSeed) {
    const found = await db.query.categories.findFirst({ where: eq(schema.categories.slug, c.slug) });
    if (found) { catIds[c.slug] = found.id; continue; }
    const [row] = await db.insert(schema.categories).values(c).returning();
    catIds[c.slug] = row.id;
  }
  console.log(`✔ ${catsSeed.length} categorias`);

  // Produtos (imagens: placeholders públicos)
  const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/800`;
  const productsSeed = [
    { name: "Vaso Geométrico Low Poly", slug: "vaso-geometrico-low-poly", cat: "decoracao", priceCents: 4990, compareAtPriceCents: 6490, stockQty: 6, materialGrams: 85, printMinutes: 240, costCents: 1800, tags: ["destaques", "novidades"], description: "Vaso decorativo com faces geométricas, ideal para suculentas e plantas pequenas. Impresso em PLA com acabamento fosco.", featured: true, variants: [["Preto", "#1c1c1c", "PLA Preto"], ["Branco", "#f5f5f5", "PLA Branco"], ["Rosa", "#f4afab", "PLA Rosa"]] },
    { name: "Suporte de Headset de Mesa", slug: "suporte-headset-mesa", cat: "tech", priceCents: 5990, stockQty: 3, materialGrams: 140, printMinutes: 360, costCents: 2600, tags: ["destaques", "mais-vendidos"], description: "Suporte robusto para headset com base larga antiderrapante. Cabe qualquer modelo gamer.", featured: true, variants: [["Preto", "#1c1c1c", "PLA Preto"], ["Branco", "#f5f5f5", "PLA Branco"]] },
    { name: "Chaveiro Personalizado com Nome", slug: "chaveiro-personalizado-nome", cat: "presentes", priceCents: 1490, stockQty: 0, materialGrams: 8, printMinutes: 25, costCents: 350, tags: ["presentes", "novidades"], description: "Chaveiro em duas cores com o nome que você quiser (até 12 letras). Feito sob encomenda.", isCustomizable: true, customizationHint: "Informe o nome exatamente como deve aparecer (até 12 letras)", variants: [["Preto/Amarelo", "#f4f482", "PLA Preto"], ["Rosa/Branco", "#f4afab", "PLA Rosa"]] },
    { name: "Organizador de Cabos Clip (kit 6)", slug: "organizador-cabos-clip-kit", cat: "organizacao", priceCents: 1990, compareAtPriceCents: 2990, stockQty: 12, materialGrams: 30, printMinutes: 60, costCents: 700, tags: ["limpa-estoque"], description: "Kit com 6 clipes adesivos para organizar cabos na mesa. Impressos em PETG flexível e resistente." },
    { name: "Luminária Lua 3D 12cm", slug: "luminaria-lua-12cm", cat: "decoracao", priceCents: 8990, compareAtPriceCents: 11990, stockQty: 2, materialGrams: 160, printMinutes: 540, costCents: 3900, tags: ["destaques", "black-friday"], description: "Luminária esférica com relevo da superfície lunar, LED quente incluso e base de madeira.", featured: true },
    { name: "Suporte de Celular Dobrável", slug: "suporte-celular-dobravel", cat: "tech", priceCents: 2490, stockQty: 8, materialGrams: 45, printMinutes: 110, costCents: 1000, tags: ["mais-vendidos"], description: "Suporte compacto que cabe no bolso, com 3 ângulos de inclinação.", variants: [["Preto", "#1c1c1c", "PLA Preto"], ["Rosa", "#f4afab", "PLA Rosa"]] },
    { name: "Porta-Trecos Hexagonal Modular", slug: "porta-trecos-hexagonal", cat: "organizacao", priceCents: 3490, stockQty: 5, materialGrams: 70, printMinutes: 200, costCents: 1500, tags: ["novidades"], description: "Módulos hexagonais que se encaixam para montar seu organizador de mesa." },
    { name: "Miniatura Articulada Dragão", slug: "miniatura-dragao-articulado", cat: "presentes", priceCents: 3990, compareAtPriceCents: 4990, stockQty: 4, materialGrams: 55, printMinutes: 180, costCents: 1300, tags: ["black-friday", "presentes"], description: "Dragão articulado impresso em peça única, sem montagem. Sucesso entre crianças e adultos." },
  ];
  let created = 0;
  for (const p of productsSeed) {
    if (await db.query.products.findFirst({ where: eq(schema.products.slug, p.slug) })) continue;
    const { cat, variants, tags, ...rest } = p;
    const [row] = await db
      .insert(schema.products)
      .values({ ...rest, tags: [...tags], categoryId: catIds[cat], status: "active", materialId: matIds["PLA Preto"] })
      .returning();
    await db.insert(schema.productImages).values([
      { productId: row.id, url: img(p.slug), sortOrder: 0 },
      { productId: row.id, url: img(`${p.slug}-2`), sortOrder: 1 },
    ]);
    if (variants) {
      await db.insert(schema.productVariants).values(
        variants.map(([value, colorHex, matName], i) => ({ productId: row.id, name: "Cor", value, colorHex, stockQty: Math.ceil(p.stockQty / variants.length), materialId: matIds[matName], sortOrder: i })),
      );
    }
    created++;
  }
  // Ficha técnica (BOM) para produtos sem BOM: usa materialGrams no material principal
  const allProducts = await db.query.products.findMany({ with: { bom: true } });
  let bomAdded = 0;
  for (const p of allProducts) {
    if (p.bom.length) continue;
    if (p.slug === "chaveiro-personalizado-nome") {
      await db.insert(schema.productMaterials).values([
        { productId: p.id, materialId: matIds["PLA Preto"], gramsPerUnit: 5, note: "base", sortOrder: 0 },
        { productId: p.id, materialId: matIds["TPU Amarelo"], gramsPerUnit: 3, note: "letras", sortOrder: 1 },
      ]);
    } else if (p.materialGrams > 0) {
      await db.insert(schema.productMaterials).values({ productId: p.id, materialId: p.materialId ?? matIds["PLA Preto"], gramsPerUnit: p.materialGrams, note: "corpo", sortOrder: 0 });
    }
    bomAdded++;
  }
  console.log(`✔ ficha técnica em ${bomAdded} produto(s)`);
  console.log(`✔ ${created} produtos criados (${productsSeed.length - created} já existiam)`);

  // Vídeo vertical de exemplo (CC0) no vaso, para demonstrar a galeria estilo Instagram
  const vaso = await db.query.products.findFirst({ where: eq(schema.products.slug, "vaso-geometrico-low-poly"), with: { images: true } });
  if (vaso && !vaso.images.some((i) => i.type === "video")) {
    await db.insert(schema.productImages).values({
      productId: vaso.id,
      url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      type: "video",
      posterUrl: img("vaso-geometrico-low-poly-poster"),
      sortOrder: 1,
    });
    console.log("✔ vídeo de exemplo adicionado ao vaso");
  }

  // Zonas de entrega local (região de Americana) — só as faixas que ainda não existem
  const existingZones = await db.query.shippingZones.findMany();
  const missingZones = DEFAULT_ZONES.filter((z) => !existingZones.some((e) => e.cepStart === z.cepStart && e.cepEnd === z.cepEnd));
  if (missingZones.length) await db.insert(schema.shippingZones).values(missingZones);
  console.log(`✔ ${missingZones.length} zona(s) de entrega local`);

  // Configurações iniciais
  const defaults: Record<string, string> = { shop_name: "AHL Studio", shop_tagline: "Impressão 3D sob medida", shipping_correios_cents: "2500", shipping_origin_cep: "13465000" };
  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }
  console.log("✔ configurações");
  console.log("\nPronto! Login admin:", adminEmail, "/", adminPassword);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
