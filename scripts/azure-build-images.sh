#!/usr/bin/env bash
set -euo pipefail
registry="$ACR_NAME.azurecr.io"
public_url="https://ciz-$AZURE_ENVIRONMENT-frontend.$DEFAULT_DOMAIN"
build_push() {
  local context=$1 dockerfile=$2 image=$3
  shift 3
  docker buildx build --platform linux/amd64 --file "$dockerfile" \
    --tag "$registry/$image:$IMAGE_TAG" --push "$@" "$context"
}
for service in case-service bas-service assessment-service document-service policy-service workflow-start-adapter address-validation-adapter document-structuring-adapter impairment-analysis-adapter status-notification-adapter; do
  build_push . "$service/Dockerfile" "$service" --target runtime \
    --build-arg REGELRECHT_REVISION=89f43786b66ed270b066ae32a48332ce189c73a5
done
build_push processes processes/Dockerfile operaton-ciz
build_push . pipeline-mock/Dockerfile pipeline-mock
build_push . infra/minio/Dockerfile s3
build_push . infra/gateway/Dockerfile gateway --build-arg "ENVIRONMENT=$AZURE_ENVIRONMENT"
build_push frontend frontend/Dockerfile frontend --target runtime \
  --build-arg "VITE_OIDC_AUTHORITY=$public_url/auth/realms/ciz-poc" \
  --build-arg VITE_OIDC_CLIENT_ID=ciz-frontend \
  --build-arg "VITE_OIDC_REDIRECT_URI=$public_url/oidc/callback" \
  --build-arg "VITE_OIDC_POST_LOGOUT_REDIRECT_URI=$public_url/aanvrager" \
  --build-arg VITE_OIDC_ROLE_CLAIM_PATH=ciz_roles
build_push . infra/frontend/Dockerfile frontend-azure --build-arg "FRONTEND_IMAGE=$registry/frontend:$IMAGE_TAG"
