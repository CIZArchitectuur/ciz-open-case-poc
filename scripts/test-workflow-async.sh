#!/bin/sh
set -eu
# Use the caller's COMPOSE_FILE, including the deterministic analysis overlay in CI.
docker compose stop workflow-start-adapter
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    # Counts and broker offsets only; never print application payloads.
    docker compose exec -T kafka rpk group describe workflow-start-submissions || true
    docker compose exec -T case-db psql -U cases -d cases -c 'SELECT event_type, count(*) FILTER (WHERE published_at IS NULL) AS pending FROM application_submission_outbox GROUP BY event_type;' || true
    docker compose exec -T workflow-start-db psql -U workflow -d workflow -c 'SELECT count(*) AS receipts, count(*) FILTER (WHERE completed_at IS NULL) AS pending FROM workflow_receipts;' || true
  fi
  docker compose up -d --no-deps --wait operaton workflow-start-adapter >/dev/null || true
  exit "$result"
}
trap cleanup EXIT
workflow_scenario=$(docker compose run --rm --no-deps integration-tests python -m tests.workflow_probe submit)
docker compose up -d --no-deps --wait workflow-start-adapter
docker compose run --rm --no-deps -e WORKFLOW_SCENARIO="$workflow_scenario" integration-tests python -m tests.workflow_probe verify
# A running consumer must also defer upstream-engine failures without rejecting submission.
docker compose stop operaton
workflow_scenario=$(docker compose run --rm --no-deps integration-tests python -m tests.workflow_probe submit-unavailable)
sleep 5
docker compose up -d --no-deps --wait operaton
docker compose run --rm --no-deps -e WORKFLOW_SCENARIO="$workflow_scenario" integration-tests python -m tests.workflow_probe verify
# Snappy-compressed replay must be readable by the Alpine JVM consumers; both deliveries remain harmless.
printf '%s\n%s\n' "$workflow_scenario" "$workflow_scenario" | docker compose exec -T kafka rpk topic produce application.submitted --compression snappy >/dev/null
sleep 5
docker compose restart workflow-start-adapter
docker compose run --rm --no-deps -e WORKFLOW_SCENARIO="$workflow_scenario" integration-tests python -m tests.workflow_probe verify

# An existing task does not prove that the restarted consumer can accept new work.
docker compose up -d --no-deps --wait workflow-start-adapter
docker compose run --rm --no-deps integration-tests python -m tests.workflow_probe verify-fresh
