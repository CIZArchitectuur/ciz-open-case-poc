#!/bin/sh
set -eu
# The Azure Blob profile has no volume on s3: persisted bytes live in Azurite/Blob.
blob_scenario=$(docker compose run --rm --no-deps integration-tests python -m tests.blob_probe store)
docker compose restart s3
docker compose up -d --no-deps --wait s3
docker compose run --rm --no-deps -e BLOB_SCENARIO="$blob_scenario" integration-tests python -m tests.blob_probe verify
