# AHL Studio — notas para agentes

Leia o `README.md` para visão geral. Next.js 16: ver `AGENTS.md` (docs em `node_modules/next/dist/docs/`) antes de mexer em convenções (proxy, params assíncronos, cache).

## Convenções do projeto

- **Dinheiro em centavos** (`integer`). Use `formatBRL` / `parseBRLToCents` / `centsToInput` de `src/lib/money.ts`. Nunca float.
- **Enums** são `text` + union TS em `src/db/schema.ts`; rótulos pt-BR e cor de badge em `src/lib/labels.ts`. Ao criar um status novo, atualize os dois.
- **Server actions** vivem em `src/actions/*.ts` (`"use server"`, só exports `async`). Ações de admin começam com `await requireAdmin()`. Formulários com feedback usam `useActionState` + `ActionState` (`components/ui/form-message.tsx`); ações simples recebem `FormData` direto.
- **Carrinho** é cookie JSON (`lib/cart.ts`); preços sempre recalculados no servidor a partir do banco.
- **Frete** (`lib/shipping.ts`): `quoteShipping()` monta as opções — retirada, entrega local por zona de CEP (`shipping_zones`) e Correios/transportadoras via `lib/shipping-providers.ts` (SuperFrete/Melhor Envio; tokens só em env). O cliente escolhe um `ShippingOption.id`; `placeOrderAction` **recota** e usa o preço do servidor. CEP/opção escolhida vivem no cookie `ahl_ship` (`lib/shipping-pref.ts`). Pedido guarda snapshot (`shippingService/Carrier/DaysMin/DaysMax/Zip`) e `shippingCostCents` (etiqueta paga ao provedor ou `shipping_zones.costCents`) — entra no COGS do DRE; `ShippingOption.costCents` nunca vai ao cliente (`quoteForCepAction` remove). Produto tem peso/dimensões de embalagem (0 = padrão em settings). **Prazo de produção é atributo do pedido** (`orders.productionDays`, dias úteis): estimado no checkout por `estimateProductionDays()` (`lib/production.ts`: impressão = minutos ÷ `production_hours_per_day`×`production_parallel_machines`; pós-processo = `products.laborMinutes` ÷ `production_labor_hours_per_day`; + `shipping_handling_days`; itens em estoque só contam embalagem), embutido em `daysMin/daysMax` de todas as opções e editável no admin do pedido; previsão de data com `addBusinessDays(paidAt ?? createdAt, …)`.
- **Fila de produção** (`lib/production-queue.ts`): jobs entram sozinhos quando o pedido é pago (`enqueueOrderJobs` — itens com `orderItems.toProduceQty > 0` ou personalizados; webhook MP e ação manual de pagamento), com `dueAt` = pagamento + prazo prometido. Ordem = imprimindo → `dueAt` → prioridade. `getBacklog()` (minutos na fila, cache 60 s) entra em `productionDaysFor` → o tamanho da fila muda o prazo de novas vendas. `suggestStockJobs()` sugere fornadas para estoque saudável (`products.targetStockQty` ou velocidade × `production_stock_cover_days`). Ao criar/concluir jobs chame `clearBacklogCache()`.
- **Conta do cliente**: `users.phone/document` e `addresses.userId` (até 10 endereços, um `isDefault`); actions em `actions/account.ts`, sempre escopadas por `session.user.id`.
- **Tags de produto** (`products.tags`, JSON) geram seções da home; `destaques` alimenta o carrossel hero. Labels/ordem em `lib/tags.ts`.
- **Imagens** são URLs externas (sem storage). Upload para GCS é um follow-up.
- **Banco**: sem `TURSO_DATABASE_URL` cai em `file:local.db`. Schema mudou → `npm run db:generate` (gera SQL em `drizzle/`) → `npm run db:migrate` (ou `db:push` em dev).
- **Estilo**: paleta pastel em `globals.css` (`blush`, `rose`, `powder`, `custard`, `canary`); títulos em Fredoka (`font-display`), corpo Nunito. Componentes base em `components/ui/`.
- **RBAC**: toda action de backoffice começa com `await requirePermission("<perm>")` e toda page do admin com `await requirePagePermission("<perm>")` (`lib/rbac.ts`). Cliente nunca vê /admin. Páginas de cliente com dados pessoais (pedido, orçamento, chamado, anexo) passam por `canAccessX()` em `lib/security.ts` (dono, e-mail da sessão, token do link ou equipe).
- **Auditoria**: ações relevantes chamam `audit({ action: "entidade.verbo", ... })` (`lib/audit.ts`); eventos de sistema usam `systemLog`. Nunca logar senha/token/dados de cartão.
- **LGPD**: aceites via `recordConsent`; documentos legais em /termos e /privacidade com `TERMS_VERSION`/`PRIVACY_VERSION` — ao alterar o texto, suba a versão.
- Evitar a palavra "impressora" na UI: usar "máquina"/"studio". "Impressão 3D" (o processo) pode.
- Idioma da UI: **pt-BR**. Código e identificadores em inglês.

## Checagens

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
```
