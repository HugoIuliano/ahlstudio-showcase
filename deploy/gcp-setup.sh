#!/usr/bin/env bash
# Configuração inicial do projeto GCP para o AHL Studio (rodar uma vez).
# Uso: PROJECT_ID=ahlstudio-prod REGION=us-east4 BUDGET_BRL=30 bash deploy/gcp-setup.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?defina PROJECT_ID (ex.: ahlstudio-prod)}"
REGION="${REGION:-us-east4}"
REPO="${REPO:-ahlstudio}"
BUDGET_BRL="${BUDGET_BRL:-30}"
ENV_FILE="${ENV_FILE:-.env.local}"

echo "▶ projeto $PROJECT_ID · região $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "▶ habilitando APIs (Cloud Run, Artifact Registry, Cloud Build, Secret Manager, Billing Budgets)"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com billingbudgets.googleapis.com

echo "▶ repositório de imagens (com limpeza automática: mantém só as 3 últimas)"
if ! gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REGION" --description "AHL Studio images"
fi
cat > /tmp/ahl-cleanup.json <<'EOF'
[
  { "name": "keep-recent", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 3 } },
  { "name": "delete-old", "action": { "type": "Delete" }, "condition": { "olderThan": "2592000s" } }
]
EOF
gcloud artifacts repositories set-cleanup-policies "$REPO" --location "$REGION" --policy /tmp/ahl-cleanup.json --no-dry-run >/dev/null || true

echo "▶ segredos a partir de $ENV_FILE"
# lê KEY=VALUE ignorando comentários/vazios
declare -A ENV
while IFS='=' read -r k v; do
  [[ -z "$k" || "$k" =~ ^# ]] && continue
  ENV["$k"]="${v}"
done < <(grep -E '^[A-Z_]+=' "$ENV_FILE" || true)

for key in TURSO_DATABASE_URL TURSO_AUTH_TOKEN AUTH_SECRET MP_ACCESS_TOKEN MP_WEBHOOK_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET SUPERFRETE_TOKEN MELHORENVIO_TOKEN; do
  val="${ENV[$key]:-}"
  if [[ -z "$val" ]]; then echo "  · $key vazio em $ENV_FILE — pulando (defina depois com: printf %s 'valor' | gcloud secrets versions add $key --data-file=-)"; continue; fi
  if gcloud secrets describe "$key" >/dev/null 2>&1; then
    printf %s "$val" | gcloud secrets versions add "$key" --data-file=- >/dev/null
    echo "  · $key: nova versão"
  else
    printf %s "$val" | gcloud secrets create "$key" --data-file=- --replication-policy automatic >/dev/null
    echo "  · $key: criado"
  fi
done

echo "▶ permissões da service account padrão (Cloud Run lê segredos; Cloud Build lê o fonte, grava a imagem e os logs)"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
# Em projetos criados após 2024 o Cloud Build usa a compute SA, que nasce sem essas permissões.
for role in roles/secretmanager.secretAccessor roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/storage.objectViewer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" --role "$role" --condition None >/dev/null
done

echo "▶ orçamento de R\$ $BUDGET_BRL com alertas em 50/90/100 %"
BILLING=$(gcloud billing projects describe "$PROJECT_ID" --format 'value(billingAccountName)')
if [[ -n "$BILLING" ]]; then
  gcloud billing budgets create --billing-account "${BILLING#billingAccounts/}" --display-name "AHL Studio mensal" \
    --budget-amount "${BUDGET_BRL}BRL" --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0 \
    --filter-projects "projects/$PROJECT_NUMBER" >/dev/null 2>&1 && echo "  · orçamento criado" || echo "  · orçamento já existe ou faturamento sem permissão — crie em Console → Faturamento → Orçamentos"
else
  echo "  · projeto sem conta de faturamento vinculada — vincule no console antes do deploy"
fi

echo "✔ setup concluído. Próximo: bash deploy/gcp-deploy.sh"
