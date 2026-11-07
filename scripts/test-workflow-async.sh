#!/bin/sh
set -eu
# Use the caller's COMPOSE_FILE, including the deterministic analysis overlay in CI.
docker compose stop workflow-start-adapter
trap 'docker compose up -d --no-deps operaton workflow-start-adapter >/dev/null' EXIT
workflow_scenario=$(docker compose run --rm --no-deps integration-tests python -m tests.workflow_probe submit)
docker compose up -d --no-deps --wait workflow-start-adapter
docker compose run --rm --no-deps -e WORKFLOW_SCENARIO="$workflow_scenario" integration-tests python -m tests.workflow_probe verify
# A running consumer must also defer upstream-engine failures without rejecting submission.
docker compose stop operaton
workflow_scenario=$(docker compose run --rm --no-deps integration-tests python -m tests.workflow_probe submit-unavailable)
sleep 5
docker compose up -d --no-deps --wait operaton
docker compose run --rm --no-deps -e WORKFLOW_SCENARIO="$workflow_scenario" integration-tests python -m tests.workflow_probe verify
# New event ID and duplicate delivery for the same application must both be harmless.
printf '%s\n%s\n' "$workflow_scenario" "$workflow_scenario" | docker compose exec -T kafka rpk topic produce application.submitted >/dev/null
sleep 5
docker compose restart workflow-start-adapter
docker compose run --rm --no-deps -e WORKFLOW_SCENARIO="$workflow_scenario" integration-tests python -m tests.workflow_probe verify
