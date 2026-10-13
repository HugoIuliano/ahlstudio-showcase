#!/usr/bin/env bash
# Build na nuvem (Cloud Build) + deploy no Cloud Run. Idempotente.
# Uso: PROJECT_ID=ahlstudio-prod REGION=us-east4 APP_URL=https://loja.seudominio.com.br bash deploy/gcp-deploy.sh
#   MIN_INSTANCES=1 para eliminar cold start (~US$ 10/mês).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-east4}"
SERVICE="${SERVICE:-ahlstudio}"
REPO="${REPO:-ahlstudio}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

echo "▶ build da imagem na nuvem: $IMAGE"
gcloud builds submit --project "$PROJECT_ID" --region "$REGION" --tag "$IMAGE" --timeout 20m .

# URL pública: se APP_URL não for informada, usa a URL *.run.app do serviço (após o 1º deploy)
APP_URL="${APP_URL:-$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)}"

SECRETS="TURSO_DATABASE_URL=TURSO_DATABASE_URL:latest,TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest,AUTH_SECRET=AUTH_SECRET:latest"
for opt in MP_ACCESS_TOKEN MP_WEBHOOK_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET SUPERFRETE_TOKEN MELHORENVIO_TOKEN; do
  gcloud secrets describe "$opt" --project "$PROJECT_ID" >/dev/null 2>&1 && SECRETS="$SECRETS,$opt=$opt:latest"
done

echo "▶ deploy no Cloud Run ($REGION) · min $MIN_INSTANCES · max $MAX_INSTANCES"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" \
  --platform managed --allow-unauthenticated \
  --port 8080 --cpu 1 --memory 512Mi --concurrency 80 --timeout 60 \
  --min-instances "$MIN_INSTANCES" --max-instances "$MAX_INSTANCES" --cpu-boost \
  --set-env-vars "NODE_ENV=production,AUTH_TRUST_HOST=true,NEXT_TELEMETRY_DISABLED=1${APP_URL:+,AUTH_URL=$APP_URL,NEXT_PUBLIC_APP_URL=$APP_URL}" \
  --set-secrets "$SECRETS"

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')
echo "✔ no ar: $URL"
if [[ -z "${APP_URL:-}" || "$APP_URL" != "$URL" ]]; then
  echo "  · se esta foi a 1ª vez, rode de novo com APP_URL=$URL (ou o domínio próprio) para gravar AUTH_URL/NEXT_PUBLIC_APP_URL."
fi
echo "  · webhook Mercado Pago: $URL/api/webhooks/mercadopago"
echo "  · callback Google:      $URL/api/auth/callback/google"
