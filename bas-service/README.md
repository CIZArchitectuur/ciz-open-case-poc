# BAS-service

Eigenaar van OCR-/extractieversies, dossieranalyses, bronverwijzingen en menselijke
broncontroles. Metadata, OCR en dossieranalyse zijn onafhankelijk selecteerbaar
via `contracts/openapi/bas-service.yaml`; providerintegraties blijven in de
document-structuring- en impairment-analysis-adapters. Alle HTTP-aanroepen lopen
via Kong. De service gebruikt uitsluitend `bas-db`.

DocumentReceived start metadata en OCR; ApplicationSubmitted start verwerking
van een ingediende documentset inclusief dossieranalyse zodra de OCR-bronnen
gereed zijn. Dubbele event-ID's worden genegeerd. Andere interne aanroepers
kunnen `POST /cases/{caseId}/runs` gebruiken met een eigen run-ID, componenten en
aanleiding. `forceRerun` produceert nieuwe extractieversies. Een dossier-only
run zonder OCR-bronnen wacht op die bronnen.

Zelfstandig bouwen vanuit de repositoryroot:

```sh
docker build -f bas-service/Dockerfile -t ciz-bas-service .
docker compose up -d bas-service
docker compose -f compose.yaml -f compose.analysis-test.yaml --profile test run --build --rm integration-tests pytest -q tests/integration/test_submission.py tests/integration/test_domain_migration.py tests/integration/test_dossier_analysis.py
```

Configuratie: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `API_GATEWAY_URL`,
`KAFKA_BOOTSTRAP_SERVERS`, `IMPAIRMENT_READ_TIMEOUT_MS` en `OTEL_*`.
Flyway beheert het schema. De HTTP-API heeft geen hostpoort; onderzoekertoegang
wordt aan de facade afgedwongen. Historische import behoudt identifiers en audit.
