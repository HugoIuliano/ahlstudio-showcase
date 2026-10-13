import { slugify } from "./utils";

/**
 * Tags de produto viram seções dinâmicas na home.
 * "destaques" alimenta o carrossel hero; as demais viram trilhos na ordem abaixo.
 * Tags desconhecidas também aparecem (título = tag formatada).
 */
export const FEATURED_TAG = "destaques";

export const KNOWN_TAGS: Record<string, { title: string; subtitle?: string; tone: "canary" | "powder" | "custard" | "rose" | "neutral" }> = {
  destaques: { title: "Destaques", tone: "canary" },
  novidades: { title: "Novidades", subtitle: "Acabou de sair do studio", tone: "custard" },
  "black-friday": { title: "Black Friday", subtitle: "Preços especiais por tempo limitado", tone: "powder" },
  "limpa-estoque": { title: "Limpa estoque", subtitle: "Últimas unidades, preço de saída", tone: "rose" },
  promocao: { title: "Promoção", tone: "powder" },
  "mais-vendidos": { title: "Mais vendidos", tone: "custard" },
  presentes: { title: "Para presentear", tone: "rose" },
  natal: { title: "Natal", tone: "powder" },
  "dia-das-maes": { title: "Dia das Mães", tone: "rose" },
};

const ORDER = Object.keys(KNOWN_TAGS);

export function normalizeTags(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input) ? input : (input ?? "").split(",");
  return [...new Set(raw.map((t) => slugify(t)).filter(Boolean))];
}

export function tagLabel(tag: string) {
  return KNOWN_TAGS[tag]?.title ?? tag.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Ordena tags: conhecidas primeiro (na ordem definida), depois alfabético. */
export function sortTags(tags: string[]) {
  return [...tags].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

/** Tags que merecem selo no card do produto (exceto "destaques", que só posiciona). */
export const BADGE_TAGS = ["novidades", "black-friday", "limpa-estoque", "promocao"];
