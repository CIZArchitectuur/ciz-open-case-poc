# Beoordeling en besluit

Eigenaar van beleidsbeoordelingen, medische beoordelingen, besluiten en de
administratieve verzendaudit. De OpenAPI-contracten gebruiken de bestaande
getypeerde records met feiten, resolvedInputs, outputs, regelversies, hash,
peildatum en beoordelingstijd. Ze worden in `assessment-db` opgeslagen;
meerdere besluiten per zaak blijven mogelijk.

Nieuwe evaluaties en besluiten zijn idempotent op hun oorspronkelijke ID.
Verzending wijzigt alleen de verzendaudit. Historische import overschrijft geen
bestaande gegevens. RegelRecht bepaalt beleidsuitkomsten; menselijke medische
oordelen komen via expliciete feiten binnen. Taakvolgorde blijft bij Operaton.

Zelfstandig bouwen vanuit de repositoryroot:

```sh
docker build -f assessment-service/Dockerfile -t ciz-assessment-service .
docker compose up -d assessment-service
docker compose --profile test run --build --rm integration-tests pytest -q tests/integration/test_domain_migration.py tests/integration/test_case_lifecycle.py
```

Configuratie: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` en `OTEL_*`.
Flyway beheert het schema. De interne API loopt via Kong en heeft geen hostpoort.
De zaakservice biedt de rolbeveiligde browserfacade.
