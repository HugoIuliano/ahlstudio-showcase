# Deploy no Google Cloud — custo e passo a passo

## 1. Visão de custo (por mês)

Arquitetura: **Cloud Run** (container Next.js `standalone`, escala a zero) + **Turso** (banco, fora do GCP) + **Mercado Pago**. Sem load balancer, sem VM, sem Cloud SQL — são esses três que costumam gerar conta.

Premissas para uma loja pequena: ~15 mil visitas/mês ≈ 300 mil requisições (páginas + assets), 0,2 s de CPU por requisição, 512 MiB de memória.

| Serviço | Free tier (mensal, permanente) | Uso estimado | Custo estimado |
| --- | --- | --- | --- |
| **Cloud Run – CPU** | 180.000 vCPU‑s | ~60.000 vCPU‑s | **R$ 0** |
| **Cloud Run – memória** | 360.000 GiB‑s | ~30.000 GiB‑s | **R$ 0** |
| **Cloud Run – requisições** | 2.000.000 | ~300.000 | **R$ 0** |
| Cloud Run – saída de rede (egress) | 1 GiB | ~5–10 GiB (US$ 0,12/GiB) | **~R$ 3–6** |
| **Artifact Registry** (imagens Docker) | 0,5 GB | 2–3 imagens de ~200 MB (com política de limpeza) | **~R$ 0–0,50** |
| **Cloud Build** (constrói a imagem) | 120 min/dia | ~6 min por deploy | **R$ 0** |
| **Secret Manager** (tokens Turso/MP/Auth) | 6 versões ativas | ~8 segredos (US$ 0,06/versão extra) | **~R$ 1** |
| **Cloud Logging** | 50 GiB | < 1 GiB | **R$ 0** |
| Domínio próprio + TLS (domain mapping / Firebase Hosting) | grátis | — | **R$ 0** |
| **Turso** (plano free) | 9 GB, 1 bi leituras/mês | muito abaixo | **R$ 0** |
| **Total previsto** | | | **≈ R$ 5 a 10 / mês** |

O que faz a conta subir — e quanto:

| Escolha | Efeito | Custo adicional |
| --- | --- | --- |
| `--min-instances 1` (sem cold start de ~2 s na 1ª visita após ociosidade) | 1 instância sempre "morna" (cobrada a preço de idle) | **≈ US$ 10 / R$ 55 por mês** |
| Região **São Paulo (southamerica-east1)** em vez de us-east4 | preço tier 2 (~+40 %) — irrelevante enquanto dentro do free tier; latência menor para o cliente | ~R$ 0 no free tier |
| Otimização de imagem do Next (`/_next/image`) servindo fotos externas | mais CPU e egress | +R$ 2–5; dá para desligar (`images.unoptimized`) |
| Muitos deploys/dia (> 20) | estoura os 120 min de build | US$ 0,003/min |

Regra prática: **enquanto estiver no free tier a fatura fica em centavos**; o único gasto "estrutural" é decidir se quer a instância mínima (R$ ~55) para eliminar cold start. Sugestão: começar com **min 0** e `--cpu-boost` (cold start ≈ 1,5–2,5 s); ligar min 1 só se incomodar.

Créditos: o teste gratuito (US$ 300/90 dias) só existe em conta **nova e ainda em modo trial**. Uma conta já convertida para paga (com o pré‑pagamento de R$ 150 do Brasil) não recebe esse crédito — os R$ 150 viram saldo e cobrem meses de uso dentro do free tier. Não vale abrir outra conta para caçar o crédito: a mesma pessoa/cartão não se qualifica de novo.

**Configure um orçamento com alerta** (passo 6) — e‑mail em 50 %, 90 % e 100 % de R$ 30. É a proteção contra surpresa.

### Região: onde colocar o Cloud Run?
O banco (Turso) fica fora do GCP; cada página faz várias consultas, então a **distância Cloud Run ↔ Turso** pesa mais que a distância até o cliente.

| Turso está em… | Cloud Run em | Domínio próprio |
| --- | --- | --- |
| **EUA (aws-us-east-2 / Ohio)** — padrão do plano free | `us-east4` (Virgínia, tier 1, free tier) | *Domain mapping* nativo do Cloud Run — grátis, TLS automático |
| **São Paulo (gru)** | `southamerica-east1` | Cloud Run não tem domain mapping nessa região → usar **Firebase Hosting** (grátis) na frente, com rewrite para o Cloud Run |

Veja a localização no painel do Turso (`app.turso.tech → ahlstudio → Overview → Location`).

## 2. Pré‑requisitos (uma vez)
1. Instalar o **Google Cloud SDK**: https://cloud.google.com/sdk/docs/install (Windows: instalador `.exe`; marque "Bundled Python"). Depois: `gcloud init` → login com sua conta Google → escolher/criar o projeto.
2. No console: **criar projeto** (ex.: `ahlstudio-prod`) e **ativar faturamento** (cartão; nada é cobrado enquanto no free tier/créditos).
3. Rodar `deploy/gcp-setup.sh` (habilita APIs, cria repositório de imagens, segredos, orçamento e dá à service account padrão as permissões que o Cloud Build precisa — sem elas o 1º build falha com `storage.objects.get … forbidden`).

> Windows/Git Bash: se o `gcloud` reclamar que não achou Python, exporte `CLOUDSDK_PYTHON="<pasta do SDK>/platform/bundledpython/python.exe"` e adicione `<pasta do SDK>/bin` ao PATH.

## 3. Deploy
```bash
bash deploy/gcp-deploy.sh            # build na nuvem + deploy; imprime a URL *.run.app
```
Variáveis de ambiente lidas de `.env.local` para criar os segredos: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.

Depois do primeiro deploy:
1. Testar `https://<serviço>.run.app`.
2. **Mercado Pago** → Webhooks → URL `https://SEU-DOMINIO/api/webhooks/mercadopago` → copiar a assinatura para `MP_WEBHOOK_SECRET` → rodar o deploy de novo.
3. **Google OAuth** → redirect URI `https://SEU-DOMINIO/api/auth/callback/google`.
4. Domínio: `gcloud beta run domain-mappings create --service ahlstudio --domain loja.seudominio.com.br --region us-east4` e criar o CNAME indicado.
5. `/admin/configuracoes`: dados legais, PIX, WhatsApp.

## 4. Operação
- Logs: `gcloud run services logs read ahlstudio --region us-east4 --limit 100`
- Rollback: Console → Cloud Run → Revisões → "Gerenciar tráfego" (ou `gcloud run services update-traffic`).
- Custo em tempo real: Console → Faturamento → Relatórios (filtrar por projeto). O orçamento criado no setup avisa por e‑mail.
- Migrations: rodam da sua máquina contra o Turso (`npm run db:migrate`) **antes** do deploy de uma versão que muda o schema.
