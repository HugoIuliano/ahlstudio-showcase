# Relatório de segurança e UAT — AHL Studio

Data: 2026-09-12 · Escopo: código em `main` (commit `f2faadc`) · Método: revisão manual estilo pentest (white-box), scan de dependências, testes automatizados de fluxo.

## 1. Scan de dependências

| Ferramenta | Resultado |
| --- | --- |
| `npm audit --omit=dev` (produção) | **0 vulnerabilidades** |
| `npm audit` (com dev) | 4 moderadas, todas em `esbuild <=0.24.2` puxado por `drizzle-kit` (ferramenta de migração, não vai para produção). Sem correção upstream no momento; risco só em ambiente de desenvolvimento com servidor de dev exposto. |

## 2. Achados e correções (pentest white-box)

| # | Severidade | Achado | Correção | Status |
| --- | --- | --- | --- | --- |
| 1 | Alta | Páginas `/pedido/[id]`, `/orcamento/[id]` acessíveis por qualquer um que tivesse o UUID (IDOR expondo nome, endereço, telefone) | `canAccessOrder/Quote/Ticket`: dono logado, e-mail da sessão, token de 128 bits no link (`?t=`) ou equipe. Anexos servidos por `/api/files/[id]` com a mesma regra | Corrigido + testado |
| 2 | Alta | Cliente podia aprovar/recusar/mensagear orçamento de outro só com o id | Ações checam acesso (`loadAccessibleQuote`); item personalizado só entra no carrinho do dono logado e o checkout exige o e-mail da conta | Corrigido + testado |
| 3 | Alta | Papel `admin` verificado só no JWT — rebaixar não tinha efeito até expirar | `getStaffSession` confirma papel e `active` no banco a cada request/ação; bloqueio de conta imediato | Corrigido + testado |
| 4 | Alta | Sem limite de tentativas de login (força bruta) | Rate limit persistido (10/e-mail e 30/IP por 15 min) + log `auth.login_failed`; também em cadastro, orçamento, chamado e checkout | Corrigido + testado |
| 5 | Média | Senha mínima de 6 caracteres; seed com `admin123` | Política forte (10+, maiúscula, minúscula, número, símbolo), bcrypt fator 12, seed gera senha aleatória, senha do admin de seed no Turso redefinida | Corrigido + testado |
| 6 | Média | Upload aceitava `image/svg+xml` (XSS armazenado se aberto inline na mesma origem) | Bloqueio de SVG/HTML/XML/JS por extensão e MIME; resposta com `Content-Security-Policy: sandbox`, `nosniff`, tipos perigosos forçados a download | Corrigido + testado |
| 7 | Média | Token de acesso (`?t=`) vazava para a trilha de auditoria via `referer` | Auditoria grava só o caminho, sem query string | Corrigido + testado |
| 8 | Média | `redirectTo(path)` — server action sem guarda que redirecionava para qualquer URL (open redirect) | Removida | Corrigido |
| 9 | Média | `callbackUrl` do login sem validação (open redirect) | Só caminhos internos começando com `/` (e não `//`) | Corrigido |
| 10 | Média | Cadastro público podia, em tese, receber `role` | `role` é ignorado; sempre `customer`. Promoção só por `make-admin` ou `/admin/usuarios` (admin) | Corrigido + testado |
| 11 | Baixa | Sem cabeçalhos de segurança HTTP | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`, `poweredByHeader: false` | Corrigido |
| 12 | Baixa | Tempo de resposta do login revelava existência do e-mail | `bcrypt.compare` roda mesmo sem usuário | Corrigido |
| 13 | Baixa | Último admin podia ser rebaixado/bloqueado; admin podia se autoexcluir | Bloqueios em `updateUserRoleAction` e `deleteAccountAction` | Corrigido + testado |

### Verificado e considerado adequado
- **Injeção SQL**: 100% Drizzle parametrizado; `LIKE` com entrada do usuário só aceita curingas (sem impacto).
- **XSS**: React escapa por padrão; nenhum `dangerouslySetInnerHTML`; textos de cliente renderizados como texto.
- **CSRF**: server actions do Next validam `Origin`; cookies `sameSite=lax`; carrinho `httpOnly`.
- **Mass assignment**: toda action passa por schema Zod com campos explícitos e limites de tamanho.
- **Webhook Mercado Pago**: status é buscado na API do MP com o token da loja (não confia no corpo); assinatura validada quando `MP_WEBHOOK_SECRET` existe; eventos logados.
- **Segredos**: só em variáveis de ambiente; `.env*` ignorado no git; nenhum segredo em log/auditoria (PIX excluído do meta de settings).
- **Dados de cartão**: nunca passam pelo servidor (Checkout Pro).

### Pendências / recomendações (não bloqueiam)
1. **Content-Security-Policy** completa com nonce (exige `proxy.ts` gerando nonce por request) — reduz impacto de XSS futuro.
2. **"Esqueci minha senha"** por e-mail (Resend/Brevio, free tier) — hoje o reset é via `make-admin --reset` ou contato.
3. **2FA (TOTP)** para papéis de equipe.
4. **`MP_WEBHOOK_SECRET`** obrigatório em produção (hoje opcional para dev local).
5. **Anexos**: mover BLOBs para Cloudflare R2/GCS com URLs assinadas quando o volume crescer (interface `saveUploads`/`/api/files` já isola isso).
6. **Backups** do Turso (point-in-time no plano pago ou `turso db shell .dump` agendado).
7. **Retenção**: job mensal para expurgar `audit_logs`/`rate_limits` antigos conforme a Política (6 meses–5 anos).
8. **Enumeração de e-mail no cadastro** ("Já existe uma conta") — aceitável para e-commerce; trocar por fluxo de "verifique seu e-mail" se quiser eliminar.

## 3. UAT automatizado (`npm test` — 33 testes, todos passando)

Banco SQLite descartável com as **migrations reais**; server actions e libs rodam de verdade; sessão/IP/cookies simulados.

**Cliente**
- Cadastro com senha forte + aceite → consentimentos com IP/e-mail/versão; senha fraca, sem aceite e e-mail duplicado recusados; `role` injetado é ignorado.
- Troca de senha (senha atual errada, nova fraca, sucesso + auditoria).
- Força bruta: 11ª tentativa de login por e-mail bloqueada.
- Carrinho: variação, personalização, limite pelo estoque da variação, remoção, produto arquivado some do carrinho.
- Checkout visitante (PIX manual): termos obrigatórios, endereço, frete, reserva de estoque (produto e variação), cliente criado/ativado no CRM, aceite registrado, redirect com token, carrinho limpo, auditoria.
- Orçamento a partir de item `custom` do catálogo com anexo → estimativas pré-preenchidas → mensagens só com token/dono → admin precifica (recusa sem preço) → intruso não adiciona ao carrinho → dono adiciona → checkout com e-mail errado recusado → aprovado gera pedido vinculado → recusar depois de aprovado não altera.
- Chamado de visitante com anexo → resposta da equipe muda para "aguardando cliente"; nota interna não muda; cliente reabre pelo token; invasor sem token ignorado.
- Cookies: banner grava cookie + consentimento com IP.
- Exclusão de conta: exige "EXCLUIR", anonimiza pedidos, apaga usuário, auditoria `warn`; admin não se autoexclui.
- Portabilidade: `/api/me/export` exige login (verificado no navegador).

**Backoffice**
- RBAC: atendimento não cria produto; produção não exclui produto, não confirma pagamento, não responde chamado; admin faz tudo.
- Produto: BOM multi-material define material principal e gramas; mídia com vídeo + capa; tags normalizadas; slug duplicado recusado; tipo `custom` com roteiro.
- Pedido: pagamento manual (`warn` na auditoria) → `paid`; envio para fila cria jobs com gramas/minutos da ficha → `in_production`; conclusão do job → `ready`; material baixado.
- Fornada de reposição: 10 planejadas, 8 boas, 2 perdidas, 15 g de purga → estoque do produto +8, filamento −(240 + 60 + 15) g com movimentos `print`/`waste`, máquina volta a `idle` com horas somadas; concluir de novo não baixa duas vezes; compra de material atualiza custo/kg.
- Gestão de papéis: só admin; sem autorrebaixamento; bloqueio de conta.
- Auditoria não contém query string/tokens.

**Verificado manualmente no navegador (desktop e 375 px)**: home (carrossel, seções por tag, personalizados), catálogo com filtros, página de produto (galeria 9:16 com vídeo, CTA fixo), carrinho, checkout, redirecionamento real ao Mercado Pago (preferência criada), pedido, orçamento, central de ajuda, termos, privacidade, banner de cookies, menu mobile.

**Não coberto (precisa de login humano)**: cliques nas telas do `/admin`. As actions por trás delas estão testadas; a renderização compila (`next build`) e passa no typecheck/lint.

---

## Rodada 2 — 14/09/2026 (pré-lançamento)

### Auditoria de segurança / pentest (aplicação + GCP)
Verificado (sem achados): `npm audit` 0 vulnerabilidades; nenhum segredo no repositório nem no histórico git; sem `dangerouslySetInnerHTML` com conteúdo de usuário (JSON-LD usa serialização com escape de `<`); rate limit em login/cadastro/checkout/cotação; RBAC em todas as actions de backoffice; acesso a pedido/orçamento/chamado/anexo por dono, e-mail, token ou equipe; `/api/me/export` 401 sem sessão; `/api/files/:id` 404 para ids inexistentes e sandbox CSP nos anexos; webhook do MP com assinatura obrigatória; sem vazamento de stack em 404/500; open redirect bloqueado (`safeCallback`).

Sondagens caixa-preta em produção: IDOR de pedido sem token → 404; traversal em `/api/files` → 404; `/admin/*` sem sessão → 307 para login; webhook com corpo vazio → 200 `ignored`.

Corrigido nesta rodada:
- **Content-Security-Policy** (default-src self; scripts/estilos self + inline exigido pelo Next; imagens https; `frame-src none`; `form-action` self + Mercado Pago para o redirect do checkout; `frame-ancestors self`; `upgrade-insecure-requests`) e **Cross-Origin-Opener-Policy: same-origin**. Em dev, `unsafe-eval` só para o overlay do React.
- Cookies de carrinho, frete e consentimento com `Secure` em produção.
- Rate limit na consulta de CEP (ViaCEP) — 60/10 min por IP.
- `callbackUrl` do login saneado também na renderização (só caminhos relativos).
- **GCP**: Cloud Run passou a rodar com a service account dedicada `ahlstudio-run@…` com acesso `secretAccessor` **por segredo** + `logWriter`; a service account de compute (usada pelo Cloud Build) perdeu o acesso aos segredos. Restam: owner apenas no usuário do Hugo; ingress público (loja); orçamento com alertas.

Pendências recomendadas (não bloqueiam o lançamento): rotacionar o token do Turso e do MP periodicamente; domínio próprio com HSTS preload; 2FA para contas de equipe (roadmap); avaliar `min-instances 1` para evitar cold start em picos.

### SEO / GEO
`metadataBase` + canônicas em todas as páginas públicas; títulos/descrições orientados a intenção ("funko personalizado pet", "placa avaliação Google NFC", "Americana/SP"); JSON-LD **Organization/LocalBusiness** (áreas atendidas, ofertas), **WebSite** (SearchAction), **Product** (Offer BRL, "a partir de"), **BreadcrumbList** e **FAQPage**; `sitemap.xml` dinâmico; `robots.txt` (bloqueia admin, conta, checkout, pedido, orçamento, chamados, api, login/cadastro); `llms.txt` com fatos da loja para mecanismos generativos; página `/sobre`; Open Graph image; manifest PWA. Próximos passos de SEO dependem do Hugo: domínio próprio, Google Business Profile (Americana), fotos reais dos produtos com `alt`, Search Console.

### UX / responsividade
Varredura mobile (375 px) com detecção automática de overflow horizontal em todas as páginas públicas: corrigidos o input de arquivo (largura intrínseca) e o banner de cookies; `.grid > * { min-width: 0 }` global contra "blowout"; hero com slide sempre do tamanho do trilho e título fluido; placeholders sem foto usam a marca; galeria vazia compacta com aviso "fotos em breve". Desktop conferido em home, catálogo, produto e sobre.

### UAT automatizado
59 testes (`npm test`): novos `tests/uat.test.ts` (perfil/endereços com escopo por usuário, cotação pública sem custo interno, seleção persistida, RBAC de frete, validação de zonas, checkout com endereço salvo + snapshot + custo, ajuste de prazo/custo pelo admin, exclusão de máquina, export LGPD com endereços) e `tests/production-queue.test.ts` (fila automática ao pagar, backlog no prazo, ordenação/atraso, sugestões de estoque).
