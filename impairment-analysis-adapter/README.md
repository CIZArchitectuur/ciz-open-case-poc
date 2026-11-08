# Dossier analysis adapter

Independent Camel Quarkus adapter to the existing CIZ stoornissen pipeline.
It posts an entire dossier as a multipart JSON file to the CPU orchestrator's
`POST /process-file`, with an explicit numeric analysis identifier. Original
classification units are passed without resegmentation. Document UUIDs become
unique `doc_key` values, so identifiers starting at 1 in multiple documents never
collide. The boundary is defined in `contracts/openapi/impairment-analysis.yaml`.

The upstream pipeline already uses RobBERT to classify domains. Curation and the
Ernst service supply explanations and severity; a score of zero and an unassessed
null score remain different. A generic LLM is never presented as RobBERT. The
upstream source is pinned at `integrations/stoornissen_pipeline`; its model
checkpoint is intentionally excluded from Git. Place it at
`integrations/stoornissen_pipeline/stoornis/models/stoornissen/checkpoint-400`. This adapter
speaks the upstream `/process-file` contract. Local pipeline services are not yet
connected to Compose; until then the test overlay explicitly simulates the API
and no real RobBERT inference is claimed.

No groundslag is inferred by the adapter and it does not call the upstream
zorgprofiel decoder with its default psychogeriatric groundslag. Zorgprofiel and
grondslagen remain human-entered decision fields in the PoC. The upstream payload
and response subset used here were inspected in `CIZDigitaliseert/stoornissen_pipeline`
on 2026-10-05 (ADR-0020 / final_evidence_v5). Unknown document/unit references,
out-of-range scores and invalid results fail explicitly instead of guessing.

All internal calls reach the adapter through Kong. Outbound calls carry trace and
correlation headers, have a five-second connection timeout and a configurable
ten-minute read timeout, and are not retried automatically. Exceptions and medical
payloads are never logged or returned. The case service stores a durable queued
job and exposes polling; an interrupted job is marked failed, not resubmitted.

Runtime is not configured by default. A button click produces a visible failed
analysis rather than simulated medical evidence. `compose.analysis-test.yaml`
enables an explicitly labelled contract simulation for tests only.

```sh
docker compose --profile test run --build --rm impairment-analysis-tests
docker compose -f compose.yaml -f compose.analysis-test.yaml up -d --build
docker compose -f compose.yaml -f compose.analysis-test.yaml --profile test run --build --rm integration-tests
docker compose -f compose.yaml -f compose.analysis-test.yaml --profile test run --build --rm ui-tests
```

Return to real runtime configuration with `docker compose up -d` (or add the
OpenAI OCR overlay when using real OCR). Do not publish the internal service or
Kong port. Use fictional documents only. AI proposals never populate RegelRecht
facts automatically; a researcher reviews and records findings with append-only
audit independently of process-task completion.
