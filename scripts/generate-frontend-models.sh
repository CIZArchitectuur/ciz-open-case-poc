#!/bin/sh
set -eu
# Run from the repository root. Generated transport types are committed to Git.
docker run --rm -v "$(pwd):/workspace" -w /workspace node:22-alpine \
  npx --yes openapi-typescript@7.10.1 contracts/openapi/case-service.yaml \
  -o frontend/src/generated/case-api.d.ts
