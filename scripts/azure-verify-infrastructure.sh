#!/usr/bin/env bash
set -euo pipefail
az extension add --name containerapp --upgrade --only-show-errors
wait_job() {
  local job=$1 execution=$2
  for attempt in $(seq 1 90); do
    status=$(az containerapp job execution show -g "$AZURE_RESOURCE_GROUP" -n "$job" --job-execution-name "$execution" --query properties.status -o tsv)
    case "$status" in
      Succeeded) return 0 ;;
      Failed|Stopped|Degraded) echo "::error::$job failed"; return 1 ;;
    esac
    sleep 10
  done
  echo "::error::$job timed out"
  return 1
}
jobs=egress-check
[ "${1:-all}" = storage ] && jobs=s3-init
for suffix in $jobs; do
  job="ciz-$AZURE_ENVIRONMENT-$suffix"
  execution=$(az containerapp job start -g "$AZURE_RESOURCE_GROUP" -n "$job" --query name -o tsv)
  wait_job "$job" "$execution"
  if [ "$suffix" = egress-check ]; then
    expected=$(az network public-ip show -g "$AZURE_RESOURCE_GROUP" -n "ciz-open-case-$AZURE_ENVIRONMENT-egress" --query ipAddress -o tsv)
    matched=false
    for attempt in $(seq 1 12); do
      logs=$(az containerapp job logs show -g "$AZURE_RESOURCE_GROUP" -n "$job" --execution "$execution" --container check-egress --tail 10 --format text 2>/dev/null || true)
      if printf '%s\n' "$logs" | grep -Eq "(^|[^0-9.])${expected//./\\.}([^0-9.]|$)"; then matched=true; break; fi
      sleep 5
    done
    [ "$matched" = true ] || { echo '::error::Observed egress did not match the NAT public IP'; exit 1; }
  fi
done
[ "${1:-all}" = storage ] && exit 0
apps=$(az containerapp list -g "$AZURE_RESOURCE_GROUP" --query "[?properties.configuration.ingress.external == \`true\`].name" -o tsv)
[ "$apps" = "ciz-$AZURE_ENVIRONMENT-frontend" ] || { echo '::error::Expected exactly one public Container App'; exit 1; }
