import { describe, expect, it } from "vitest";
import { can, isStaff, permissionsOf } from "@/lib/rbac";
import { canAccessOrder, canAccessQuote, canAccessTicket, safeInternalPath } from "@/lib/security";
import { passwordSchema, generateStrongPassword } from "@/lib/password";
import { calcPrice } from "@/lib/pricing";
import { bomGrams, bomMaterialCents, parseBom, unitCost } from "@/lib/production";
import { centsToInput, formatBRL, parseBRLToCents } from "@/lib/money";
import { mediaTypeFromUrl, parseMediaLines, thumbUrl } from "@/lib/media";
import { normalizeTags, sortTags } from "@/lib/tags";
import { lineKey } from "@/lib/cart";

describe("RBAC", () => {
  it("cliente não tem nenhuma permissão de backoffice", () => {
    expect(permissionsOf("customer")).toHaveLength(0);
    expect(isStaff("customer")).toBe(false);
    expect(can("customer", "orders.view")).toBe(false);
  });
  it("atendimento não acessa financeiro, configurações nem usuários", () => {
    expect(can("support", "orders.manage")).toBe(true);
    expect(can("support", "finance.view")).toBe(false);
    expect(can("support", "settings.manage")).toBe(false);
    expect(can("support", "users.manage")).toBe(false);
    expect(can("support", "audit.view")).toBe(false);
  });
  it("produção gerencia fila/estoque/máquinas mas não clientes", () => {
    expect(can("production", "production.manage")).toBe(true);
    expect(can("production", "stock.manage")).toBe(true);
    expect(can("production", "customers.manage")).toBe(false);
    expect(can("production", "orders.manage")).toBe(false);
  });
  it("admin tem tudo", () => {
    expect(can("admin", "users.manage")).toBe(true);
    expect(can("admin", "audit.view")).toBe(true);
  });
  it("papel desconhecido/nulo nega", () => {
    expect(can(null, "orders.view")).toBe(false);
    expect(can(undefined, "orders.view")).toBe(false);
  });
});

describe("Regras de acesso a dados do cliente", () => {
  const admin = { id: "a", email: "admin@x", role: "admin" as const };
  const owner = { id: "u1", email: "dono@x", role: "customer" as const };
  const other = { id: "u2", email: "outro@x", role: "customer" as const };
  const quote = { userId: "u1", accessToken: "tok123", customer: { email: "dono@x" } };

  it("orçamento: admin, dono, mesmo e-mail, token; nega o resto", () => {
    expect(canAccessQuote(quote, admin)).toBe(true);
    expect(canAccessQuote(quote, owner)).toBe(true);
    expect(canAccessQuote(quote, { id: "u9", email: "DONO@x", role: "customer" })).toBe(true);
    expect(canAccessQuote(quote, null, "tok123")).toBe(true);
    expect(canAccessQuote(quote, other)).toBe(false);
    expect(canAccessQuote(quote, other, "errado")).toBe(false);
    expect(canAccessQuote(quote, null)).toBe(false);
    expect(canAccessQuote({ ...quote, accessToken: null }, null, "")).toBe(false);
  });
  it("pedido e chamado seguem a mesma regra", () => {
    const order = { userId: null, customerEmail: "dono@x", accessToken: "t1" };
    expect(canAccessOrder(order, owner)).toBe(true);
    expect(canAccessOrder(order, other)).toBe(false);
    expect(canAccessOrder(order, null, "t1")).toBe(true);
    const ticket = { userId: "u1", email: "dono@x", accessToken: "t2" };
    expect(canAccessTicket(ticket, owner)).toBe(true);
    expect(canAccessTicket(ticket, null, "t2")).toBe(true);
    expect(canAccessTicket(ticket, other, "t1")).toBe(false);
  });
});

describe("Redirecionamento seguro", () => {
  it("aceita só caminhos internos", () => {
    expect(safeInternalPath("/conta/pedidos?x=1", "/conta")).toBe("/conta/pedidos?x=1");
    expect(safeInternalPath(undefined, "/conta")).toBe("/conta");
    expect(safeInternalPath("https://evil.example", "/conta")).toBe("/conta");
    expect(safeInternalPath("//evil.example", "/conta")).toBe("/conta");
    expect(safeInternalPath("/\\evil.example", "/conta")).toBe("/conta");
  });
});

describe("Senha forte", () => {
  it("rejeita senhas fracas", () => {
    for (const p of ["admin123", "senha", "SENHAFORTE12", "senhaforte12!", "Senhaforte!!", "Ab1!aaaa"]) {
      expect(passwordSchema.safeParse(p).success, p).toBe(false);
    }
  });
  it("aceita senha com 10+, maiúscula, minúscula, número e símbolo", () => {
    expect(passwordSchema.safeParse("Ahl-Studio#2026").success).toBe(true);
  });
  it("gerador produz senhas válidas", () => {
    for (let i = 0; i < 20; i++) expect(passwordSchema.safeParse(generateStrongPassword()).success).toBe(true);
  });
});

describe("Dinheiro", () => {
  it("parse aceita formatos brasileiros", () => {
    expect(parseBRLToCents("12,50")).toBe(1250);
    expect(parseBRLToCents("R$ 1.234,56")).toBe(123456);
    expect(parseBRLToCents("12.50")).toBe(1250);
    expect(parseBRLToCents("")).toBe(0);
    expect(parseBRLToCents(49.9)).toBe(4990);
  });
  it("formata e converte de volta", () => {
    expect(formatBRL(4990)).toMatch(/49,90/);
    expect(centsToInput(4990)).toBe("49,90");
  });
});

describe("Calculadora de custo (ERP)", () => {
  it("compõe material + máquina + mão de obra + refugo e sugere preço terminado em ,90", () => {
    const b = calcPrice({ materialGrams: 100, materialCostPerKgCents: 10000, printMinutes: 120, printerHourlyCostCents: 150, laborMinutes: 30, laborHourlyCents: 3000, failureRate: 0.1, marginPct: 0.8 });
    expect(b.materialCents).toBe(1000); // 100g de R$100/kg
    expect(b.machineCents).toBe(300); // 2h × R$1,50
    expect(b.laborCents).toBe(1500); // 0,5h × R$30
    expect(b.failureCents).toBe(280); // 10% de 2800
    expect(b.costCents).toBe(3080);
    expect(b.suggestedPriceCents % 100).toBe(90);
    expect(b.suggestedPriceCents).toBeGreaterThanOrEqual(3080 * 1.8 - 100);
  });
  it("BOM multi-material soma gramas e custo por filamento", () => {
    const bom = parseBom(JSON.stringify([{ materialId: "a", gramsPerUnit: 30 }, { materialId: "b", gramsPerUnit: 20 }, { materialId: "c", gramsPerUnit: 0 }]));
    expect(bom).toHaveLength(2);
    expect(bomGrams(bom)).toBe(50);
    expect(bomMaterialCents(bom, [{ id: "a", costPerKgCents: 10000 }, { id: "b", costPerKgCents: 20000 }])).toBe(300 + 400);
    const u = unitCost({ bom, materials: [{ id: "a", costPerKgCents: 10000 }, { id: "b", costPerKgCents: 20000 }], printMinutes: 60, printerHourlyCents: 100, laborHourlyCents: 0, failureRate: 0, marginPct: 1 });
    expect(u.materialCents).toBe(700);
    expect(u.costCents).toBe(800);
  });
  it("parseBom ignora lixo", () => {
    expect(parseBom("não é json")).toEqual([]);
    expect(parseBom(null)).toEqual([]);
  });
});

describe("Mídia, tags e carrinho", () => {
  it("detecta vídeo pela extensão e lê poster", () => {
    expect(mediaTypeFromUrl("https://x/a.MP4?x=1")).toBe("video");
    expect(mediaTypeFromUrl("https://x/a.jpg")).toBe("image");
    const lines = parseMediaLines("https://x/a.jpg\nhttps://x/v.mp4 | https://x/capa.jpg\nftp://nao\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ type: "video", posterUrl: "https://x/capa.jpg" });
    expect(thumbUrl([{ url: "https://x/v.mp4", type: "video", posterUrl: "https://x/capa.jpg" }])).toBe("https://x/capa.jpg");
    expect(thumbUrl([{ url: "https://x/v.mp4", type: "video", posterUrl: null }])).toBeNull();
  });
  it("normaliza e ordena tags", () => {
    expect(normalizeTags("Black Friday, novidades ,, DESTAQUES")).toEqual(["black-friday", "novidades", "destaques"]);
    expect(sortTags(["zzz", "limpa-estoque", "novidades"])).toEqual(["novidades", "limpa-estoque", "zzz"]);
  });
  it("chave de linha distingue produto/variação/personalização e item de orçamento", () => {
    expect(lineKey({ productId: "p", variantId: "v", customization: "Ana" })).toBe("p|v|Ana");
    expect(lineKey({ quoteId: "q" })).toBe("q:q");
  });
});
