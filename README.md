# CIZ Open Case PoC

Container-first proof of concept for a fictional Wlz application. The current vertical slice creates and retrieves cases, stores supporting documents through the S3 protocol, evaluates intake completeness and a human-validated medical assessment with RegelRecht, and runs the resulting workflow in Operaton. It contains a React frontend, independent Quarkus case, document, and policy services, Operaton, isolated PostgreSQL databases, versioned OpenAPI, RegelRecht, and BPMN contracts, Flyway migrations, health endpoints, and containerized tests.

## Prerequisites

Only Git and Docker with Docker Compose are required. Java, Maven, Node.js, npm, Python, and PostgreSQL run exclusively inside containers.

## Start

```bash
docker compose up --build
```

Open the application at <http://localhost:3000>. The API is available at <http://localhost:8080/cases>, with liveness and readiness at `/q/health/live` and `/q/health/ready`.
The frontend has separate routes for the applicant, reviewer and CIZ employee. The applicant submits the identifying and address details, resumes the application through its bookmarked URL, and can see which documents CIZ has registered. Presence checks for those submitted personal details are supplied automatically to RegelRecht and are not asked again during intake. The CIZ employee registers PDF, JPEG, or PNG documents received from a care provider, representative, or another source. The reviewer can inspect and download those documents but cannot upload them. Operaton is available at <http://localhost:8082> (local demo login: `demo` / `demo`). The local S3-compatible MinIO console is at <http://localhost:9001> (`ciz-local` / `ciz-local-secret`).

- Applicant: <http://localhost:3000/aanvrager>
- Reviewer: <http://localhost:3000/beoordelaar>
- CIZ employee: <http://localhost:3000/ciz-medewerker>

The role switch is deliberately marked as a PoC aid. It does not claim to provide authentication or authorization; OIDC is a later security milestone.

The contract exposes these operations:

- `POST /cases` and `GET /cases/{caseId}`
- `POST /cases/{caseId}/documents`, `GET /cases/{caseId}/documents`, and the document content endpoint
- `GET /cases/{caseId}/tasks`
- `GET /cases/{caseId}/medical-assessments`
- `GET /tasks?status=OPEN&type=APPLICATION_INTAKE` (or another documented task type) for role work queues
- `GET /tasks/{taskId}/medical-assessment-form` for the active RegelRecht-driven review form
- `POST /tasks/{taskId}/complete`, which is safe to repeat

The executable process is versioned at `processes/wlz-aanvraag.bpmn`. After `Compleetheid beoordelen`, RegelRecht decides the `Aanvraag compleet?` gateway. A complete application continues to `Aanvraag beoordelen`; an incomplete application goes to `Aanvullende informatie verzamelen` and then returns to the completeness check. During review, the reviewer records validated medical facts and a motivation in a form derived from the active RegelRecht policy. The explainable outcome and its immutable policy provenance are stored before administrative decision processing starts. That final administrative step records the decision but does not itself perform the medical assessment.

Stop or completely reset the environment:

```bash
docker compose down
docker compose down -v
```

## Tests

Each suite is built and executed inside Docker:

```bash
docker compose run --rm unit-tests
docker compose run --rm document-unit-tests
docker compose run --rm contract-tests
docker compose run --rm integration-tests
docker compose run --rm e2e-tests
```

The API-dependent suites start their required services automatically. Run all suites with `make test`; Make only wraps Docker Compose.

## Azure deploy

The infrastructure in `infra/` is pure Bicep and deploys into a dedicated resource group (`ciz-open-case-poc-dev`, `westeurope`) in the CIZ DBM sandbox subscription:

- `infra/bootstrap.bicep` creates the Log Analytics workspace, ACR, storage account with the `ciz-documents` container, the PostgreSQL flexible server with its databases, and the Container Apps environment.
- `infra/apps.bicep` deploys the five container apps (policy, document, Operaton, case, frontend) with system identities, ACR pull grants, and the Blob key as a Container Apps secret.

The document service speaks S3 (AWS SDK v2) against the Azure Blob S3-compatible endpoint, so no application changes are required: `S3_ENDPOINT` is the blob endpoint, the storage account key is the `S3_ACCESS_KEY` secret, and the secret key is empty.

Every push to `main` runs the CI verification first, then `.github/workflows/deploy.yml` builds the five images for `linux/amd64`, pushes them to the ACR tagged with the commit SHA, and deploys both templates. Trigger a specific deployment manually with Actions → `Azure deploy` → Run workflow, optionally overriding the globally unique suffix.

Required repository secrets: `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` of a service principal with **Contributor** on the subscription (it must read storage keys and create role assignments), and a strong `POSTGRES_ADMIN_PASSWORD`. For a one-off local deploy, log in to the CIZ DBM tenant and run:

```bash
az group create --name ciz-open-case-poc-dev --location westeurope
az deployment group create \
  --resource-group ciz-open-case-poc-dev \
  --template-file infra/bootstrap.bicep \
  --parameters @infra/parameters/dev.bicepparam \
  --parameters postgresAdminPassword='<strong-password>'
```

## Development containers

Start hot-reload development services without host runtimes:

```bash
docker compose --profile dev up case-service-dev frontend-dev
```

The development frontend is then at <http://localhost:5173> and the development case service at <http://localhost:8081>.

## Architecture and contracts

- `contracts/openapi/case-service.yaml` is the public API source of truth. The Quarkus route interface, request/response models, and validation annotations are generated from it during every container build; generated sources are not checked in.
- `contracts/openapi/operaton-workflow.yaml` is the exact subset of the Operaton REST boundary used to generate the case-service client.
- `contracts/openapi/document-service.yaml` defines the independent document boundary. Server interfaces and the case-service client are generated from it.
- `contracts/openapi/policy-service.yaml` defines the independent policy boundary. `policy-service/src/main/resources/policies/wlz-completeness.yaml` and `wlz-medical-assessment.yaml` contain the executable RegelRecht policies; Java only adapts the contracts to the official engine and contains no duplicate decision logic.
- `policy-service/src/main/resources/corpus/aanvraag-eerst` is a version-fixed source snapshot of the official CIZ aanvraag corpus. Its adjacent manifest records the upstream branch, immutable commit SHA, and content hash. It is deliberately vendored, so a clean checkout can build without GitHub credentials.
- The frontend talks to the case service through the documented `/cases` and `/tasks` APIs; its Nginx container applies bounded upstream timeouts.
- The case service alone owns the `cases` database and runs versioned Flyway migrations at startup. Operaton owns its separate `operaton` database; neither service shares tables.
- The document service owns its `documents` database and stores binary content in a private S3 bucket. The local provider is MinIO; AWS S3 or another compatible provider can be selected through environment variables without changing application code.
- Creating a case starts `wlz-aanvraag` with only the case UUID as business key. No case payload or personal data is copied into workflow variables. The task work queues join that identifier with case data inside the case service; Operaton remains free of case payloads.
- Task rows created by milestone 2 are retained as `legacy_case_tasks` for traceability but are no longer read or written; Operaton is the sole active task source.
- The official RegelRecht Rust engine is built from a pinned source revision in the policy-service container. Every response includes the engine version, schema version, regulation hash, and the checks used for its explainable outcome.
- Medical assessments are append-only records in the case database. Each record contains the validated inputs, outcome, motivation, RegelRecht engine version, policy version and regulation hash. The applicant sees the outcome only after administrative decision registration has completed.
- Runtime state lives in separate case, workflow, document-metadata, and S3 volumes. Policy evaluation is deterministic and stateless.
- OpenTelemetry instrumentation is included. Local export is disabled by `OTEL_SDK_DISABLED=true`; supply an OTLP endpoint and enable the SDK when an observability stack is added.
- Application logs go to stdout/stderr. Error responses are deliberately generic so personal data is not echoed.

## Repository scope

The PoC intentionally does not yet include OCR, Open Zaak, RabbitMQ, Camel, or APISIX. The monorepo can add these as independently deployable modules in later milestones. Supporting documents are registered by a CIZ employee; the explicit human-validated facts—not raw document contents—are supplied to RegelRecht and gate the BPMN process. The included medical policy demonstrates policy-driven decision support and is not presented as a complete, production-authoritative codification of Wlz law and policy.

The implementation follows a configure-before-build rule: Operaton, BPMN, PostgreSQL, S3, MinIO, Flyway, Panache, Quarkus Health, Fault Tolerance, OpenTelemetry, OpenAPI Generator, Nginx, and Docker Compose provide the platform behavior. Custom code is limited to the Wlz form, persistence mappings, adapters, and generic Problem Details responses.

## Refreshing the CIZ corpus

Only a corpus maintainer refreshing the committed snapshot needs GitHub CLI access to the private upstream repository. Run the following from the repository root, review the corpus and manifest changes, then commit both together:

```bash
scripts/refresh-ciz-aanvraag-corpus.sh <commit-sha>
```

The script resolves the supplied revision to a full SHA through `gh`, checks out that exact commit, and records a content hash. Docker builds and runtime containers never clone the private repository.
