"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import type { Product, ProductVariant } from "@/db/schema";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { addToCartAction } from "@/actions/cart";
import { Input, Label, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function AddToCartForm({ product, variants }: { product: Product; variants: ProductVariant[] }) {
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const unit = product.priceCents + (variant?.priceDeltaCents ?? 0);

  // agrupa variações pelo nome (ex.: "Cor")
  const groupName = variants[0]?.name;

  return (
    <form action={addToCartAction} className="space-y-4">
      <input type="hidden" name="productId" value={product.id} />
      {variantId && <input type="hidden" name="variantId" value={variantId} />}

      {variants.length > 0 && (
        <div>
          <Label>{groupName}{variant ? `: ${variant.value}` : ""}</Label>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                title={v.value}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                  v.id === variantId && "border-primary ring-2 ring-primary/30",
                )}
              >
                {v.colorHex && <span className="size-4 rounded-full border" style={{ background: v.colorHex }} />}
                {v.value}
                {v.priceDeltaCents !== 0 && <span className="text-xs text-muted-foreground">{v.priceDeltaCents > 0 ? "+" : ""}{formatBRL(v.priceDeltaCents)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {product.isCustomizable && (
        <div>
          <Label>Personalização</Label>
          <Textarea name="customization" placeholder={product.customizationHint ?? "Ex.: nome a gravar, cor específica, ajuste de medida…"} className="min-h-20" />
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="w-24">
          <Label>Qtd.</Label>
          <Input type="number" name="quantity" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <SubmitButton size="lg" className="flex-1" pendingText="Adicionando…">
          <ShoppingCart /> Adicionar · {formatBRL(unit * qty)}
        </SubmitButton>
      </div>
    </form>
  );
}
