# AHL Studio

> ⚠️ **Proprietary software — all rights reserved.** This repository is public for portfolio review only. Copying, running, deploying, modifying or using any part of it (including its business logic, or for AI training) is prohibited without written permission. See [LICENSE](LICENSE).
>
> **Software proprietário — todos os direitos reservados.** Repositório público apenas para avaliação de portfólio. É proibido copiar, executar, implantar, modificar ou usar qualquer parte dele sem autorização por escrito (Lei 9.609/98). Veja [LICENSE](LICENSE).

![CI](https://github.com/HugoIuliano/ahlstudio-showcase/actions/workflows/ci.yml/badge.svg)

> **In English:** AHL Studio is a full-stack e-commerce, CRM and ERP platform for a 3D-printing business, designed and built end to end with Claude Code as an engineering copilot.
>
> - **Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Tailwind v4, Drizzle ORM, Turso/libSQL, Auth.js v5, Docker on Google Cloud Run.
> - **Integrations:** Mercado Pago payments (Checkout Pro and a signed webhook that re-validates every payment against the provider API), and carrier rate quoting (Correios/Jadlog/Loggi via SuperFrete or Melhor Envio).
> - **Domain:** product catalog, a custom-project flow (brief → quote → approval → order → production queue), CRM with follow-ups, production scheduling that feeds delivery estimates, inventory, machine costing, and P&L.
> - **Security & compliance:** fine-grained RBAC, an audit trail, per-resource access rules, rate limiting, sandboxed file serving, and LGPD (Brazil's GDPR) self-service data export and deletion.
> - **Quality:** 60 automated unit, flow and UAT tests (Vitest, run against the real database migrations), run in CI on every push. See [docs/SEGURANCA-E-UAT.md](docs/SEGURANCA-E-UAT.md).
>
> The UI and docs are in Brazilian Portuguese; the code and identifiers are in English.

E-commerce + CRM + ERP para uma loja de impressão 3D. Venda de produtos por catálogo (com tags que geram seções dinâmicas na home) e fluxo completo de **projetos personalizados** (briefing → orçamento → aprovação → pedido → fila de produção).

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind v4 · Drizzle ORM · Turso/libSQL · Auth.js v5 (e-mail/senha + Google) · Mercado Pago (Checkout Pro + webhook) · Docker (Cloud Run).

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencha AUTH_SECRET (openssl rand -base64 32)
npm run db:push              # cria as tabelas (SQLite local ./local.db se TURSO_* vazio)
npm run db:seed              # admin + categorias + materiais + produtos de exemplo
npm run db:seed:demo         # (opcional) 6 meses de pedidos, orçamentos, fornadas, despesas, CAPEX… para validar o painel; --clean remove
npm run dev
```

- Loja: http://localhost:3000
- Painel: http://localhost:3000/admin — login com o usuário criado pelo seed (senha forte impressa no console) ou promova o seu: `npm run make-admin -- seu@email.com`

## Usando o Turso

1. Painel: https://app.turso.tech → banco `ahlstudio` → **Connect** → copie a URL `libsql://…` e gere um token.
2. Em `.env.local`:
   ```
   TURSO_DATABASE_URL=libsql://<seu-banco>-<sua-org>.turso.io
   TURSO_AUTH_TOKEN=eyJ…
   ```
3. `npm run db:migrate` (aplica `./drizzle/*.sql`) e `npm run db:seed`.

Acesso ao painel: `npm run make-admin -- seu@email.com` (promove a admin; `--reset` gera senha forte). Papéis e permissões em `src/lib/rbac.ts`.

Anexos (orçamentos/chamados) ficam no banco (BLOB, 5 MB por arquivo) e são servidos por `/api/files/[id]` com a mesma regra de acesso do orçamento/chamado.

Migrations: altere `src/db/schema.ts` → `npm run db:generate` → `npm run db:migrate`.

## Módulos

| Área | Rotas | O que faz |
| --- | --- | --- |
| Loja | `/`, `/produtos`, `/produtos/[slug]`, `/carrinho`, `/checkout`, `/pedido/[id]` | Hero carrossel (tag `destaques`), seções por tag (`novidades`, `black-friday`, `limpa-estoque`…), variações (cor), personalização por item, carrinho em cookie, checkout com retirada/entrega/Correios |
| Personalizados | `/projetos`, `/orcamento/[id]` | Briefing com links de referência, conversa cliente↔loja, aprovação gera pedido |
| Conta | `/login`, `/cadastro`, `/conta` | E-mail/senha ou Google; pedidos e orçamentos do cliente |
| Admin · Loja | `/admin/pedidos`, `/admin/produtos`, `/admin/categorias` | Pedidos com timeline, status e pagamento manual; produtos com calculadora de custo/preço, tags, variações e imagens por URL |
| Admin · CRM | `/admin/clientes`, `/admin/orcamentos` | Leads/ativos/VIP, histórico de contato com follow-up, precificação de orçamentos com sugestão |
| Admin · ERP | `/admin/producao`, `/admin/estoque`, `/admin/máquinas`, `/admin/financeiro` | Fila de produção (concluir baixa estoque e soma horas), materiais em gramas com alerta de mínimo, máquinas com custo/hora, receita × despesas |
| Atendimento | `/ajuda`, `/ajuda/chamados/[id]`, `/admin/chamados` | Central de ajuda (FAQ) e chamados com anexos, status e notas internas |
| Legal / LGPD | `/termos`, `/privacidade`, banner de cookies, `/conta` | Termos e Política gerados com os dados da loja; aceite registrado (IP, e-mail, versão, data); exportação (JSON) e exclusão de conta em autoatendimento; consentimentos por cliente |
| Segurança | `/admin/usuarios`, `/admin/auditoria` | RBAC (cliente / atendimento / produção / admin) com permissões finas em `lib/rbac.ts`; trilha de auditoria de cliente, backoffice e sistema (`lib/audit.ts`) |
| Loja | `/admin/frete` | Retirada, zonas de entrega local por CEP (região de Americana), cotação real Correios/Jadlog/Loggi via SuperFrete ou Melhor Envio, teste de cotação |
| Sistema | `/admin/configuracoes` | Nome, WhatsApp, dados legais, PIX manual, parâmetros da calculadora |

## Pagamento

- Com `MP_ACCESS_TOKEN`: checkout redireciona para o Mercado Pago (PIX/cartão/boleto). Webhook em `POST /api/webhooks/mercadopago` atualiza o pedido (valida assinatura se `MP_WEBHOOK_SECRET` estiver definido).
- Sem token: modo **PIX manual** — a página do pedido mostra a chave PIX (configurável) e o admin confirma o pagamento no painel.

## Deploy no Google Cloud Run (free tier)

```bash
gcloud run deploy ahlstudio --source . --region southamerica-east1 --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_APP_URL=https://SEU-DOMINIO,AUTH_URL=https://SEU-DOMINIO,AUTH_TRUST_HOST=true \
  --set-secrets AUTH_SECRET=ahl-auth-secret:latest,TURSO_DATABASE_URL=ahl-turso-url:latest,TURSO_AUTH_TOKEN=ahl-turso-token:latest,MP_ACCESS_TOKEN=ahl-mp-token:latest
```

O `Dockerfile` usa `output: "standalone"` (imagem pequena, escala a zero). Custo esperado: ~R$ 0 dentro do free tier (2M req/mês) — só o Artifact Registry acima de 0,5 GB cobra centavos.

## Qualidade e segurança

- `npm test` — 60 testes unitários, de fluxo e UAT (vitest + SQLite com as migrations reais), rodando no CI a cada push. Relatório: [docs/SEGURANCA-E-UAT.md](docs/SEGURANCA-E-UAT.md)

## Estrutura

```
src/
  app/(store)/     páginas públicas da loja
  app/admin/       painel (protegido por role admin)
  app/api/         Auth.js + webhook Mercado Pago
  actions/         server actions por módulo (auth, cart, checkout, catalog, orders, crm, quotes, erp, settings)
  components/      ui/ (kit básico), store/, admin/
  db/              schema.ts (Drizzle), index.ts (client), seed.ts
  lib/             auth, cart (cookie), money (centavos), pricing (calculadora), tags, settings, shipping (+ providers/quote/pref), mercadopago
  proxy.ts         checagem otimista de sessão para /admin e /conta
```

## Licença / License

Proprietário — todos os direitos reservados. Veja [LICENSE](LICENSE).
