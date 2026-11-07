# Workflow-start adapter

Independent Kafka consumer for `application.submitted`, group
`workflow-start-submissions`. The case service commits submission + outbox without
calling Operaton. BAS uses its own consumer group. Registration is the first
BPMN task; triage follows registration, not a separate Kafka start per task.

The adapter stores one durable receipt per case in **its own** PostgreSQL database,
acknowledges Kafka after that commit, and asynchronously calls the generated
Operaton OpenAPI client through Kong. Row locks prevent simultaneous workers
handling one receipt. Duplicate events and supplements do not reset receipts.
Before every attempt it checks process history, including completed instances.
No application or health payload is stored or logged; correlation and trace
identifiers are propagated.

This is at-least-once delivery with deduplication, not an atomic transaction with
the remote engine. Do not independently start/delete process instances or prune
Operaton history while recovering pending receipts. An ambiguous HTTP timeout
waits at least 30 seconds before checking history again.

Configuration: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `API_GATEWAY_URL`,
`KAFKA_BOOTSTRAP_SERVERS`, `WORKFLOW_MAX_ATTEMPTS` (12), `OTEL_SDK_DISABLED`,
`OTEL_EXPORTER_OTLP_ENDPOINT`. HTTP connect/read timeouts: 3/10 seconds.
Retries back off 30–300 seconds. After exhaustion receipts remain recoverable;
the adapter logs an operational warning, never the payload. Inspect counts with:

```sh
docker compose exec -T workflow-start-db psql -U workflow -d workflow -c 'SELECT attempts, count(*) FROM workflow_receipts WHERE completed_at IS NULL GROUP BY attempts;'
```

After fixing the upstream cause, reset **one inspected case UUID** (replace the
example UUID), not all jobs:

```sh
docker compose exec -T workflow-start-db psql -U workflow -d workflow -c "UPDATE workflow_receipts SET attempts=0,next_attempt_at=now() WHERE case_id='00000000-0000-0000-0000-000000000000' AND completed_at IS NULL;"
```

Build/start and test, using only Docker Compose:

```sh
docker compose build workflow-start-adapter
docker compose up -d --wait workflow-start-adapter
sh scripts/test-workflow-async.sh
```

The outage/replay test temporarily stops this adapter, verifies submission
still succeeds and read requests cannot create tasks, then resumes processing.
It also temporarily stops Operaton to exercise deferred upstream retries,
replays the event twice and restarts the adapter. It preserves existing volumes.
It belongs in a dedicated test/demo stack, not during an active demonstration.
