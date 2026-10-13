// Todo valor monetário é armazenado em centavos (inteiro) para evitar erro de ponto flutuante.

export function formatBRL(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "12,50" | "12.50" | "R$ 12,50" -> 1250 */
export function parseBRLToCents(input: string | number | null | undefined) {
  if (input == null || input === "") return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toFixed(2).replace(".", ",");
}
