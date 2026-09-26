# CIZ Open Case PoC

Container-first proof of concept for a fictional Wlz application. The current vertical slice creates and retrieves cases, stores supporting documents through the S3 protocol, checks Dutch addresses through an Apache Camel Quarkus/PDOK adapter, evaluates intake completeness and a human-validated medical assessment with RegelRecht, and runs the resulting workflow in Operaton. It also demonstrates asynchronous applicant-status events over Kafka, with an independent Apache Camel Quarkus batch consumer for a mocked administrative-support application. Each integration capability is packaged in its own immutable application image; Camel routes and supporting Java code are included at build time. It contains a React frontend, Kong API gateway, independent Quarkus case, document, policy and Camel integration services, Operaton, Kafka-compatible Redpanda, isolated PostgreSQL databases, versioned OpenAPI and AsyncAPI contracts, Flyway migrations, health endpoints, and containerized tests.

## Prerequisites

Only Git and Docker with Docker Compose are required. Java, Maven, Node.js, npm, Python, and PostgreSQL run exclusively inside containers.

## Start

```bash
docker compose up --build
```

Open the application at <http://localhost:3000>. Keycloak is available at <http://localhost:8082> for local OIDC sign-in. Browser requests go through the frontend proxy to Kong, which is internal to Docker and has no host-published port. Only the fictional applicant demo endpoints and the role-protected case task API are exposed through the browser; workflow, rules and document-service routes are not browser routes.
The frontend has separate routes for the applicant, reviewer and CIZ employee. The applicant submits the identifying details, address and initial care question through a five-step wizard, can answer a CIZ request for more information in the portal, resumes the application through its bookmarked URL, and sees the progress and sent decision. Presence checks for submitted personal details, application date and requested Wlz care are supplied automatically to RegelRecht. The CIZ employee registers PDF, JPEG, or PNG documents received from a care provider, representative, or another source. The reviewer can inspect and download those documents but cannot upload them. The Operaton REST API can be reached through `/api/workflow`; Kong has no process or business logic. The local S3-compatible MinIO console is at <http://localhost:9001> (`ciz-local` / `ciz-local-secret`).

- Applicant: <http://localhost:3000/aanvrager>
- Reviewer: <http://localhost:3000/beoordelaar>
- CIZ employee: <http://localhost:3000/ciz-medewerker>

The applicant wizard also records who submits and signs the application. Relevant follow-up questions are shown conditionally. These statements prefill the RegelRecht-driven intake, but a CIZ employee must still validate representation and supporting evidence before running the policy check. In the address step the applicant can optionally check a Dutch postcode and house number through the PDOK Locatieserver. A returned street and city are suggestions that must be accepted explicitly; a no-match, unsupported country, or provider outage never blocks manual entry or submission. This is a lookup aid, not proof of residence or identity.

Employee and reviewer work queues use OIDC Authorization Code with PKCE. The applicant portal remains an unauthenticated fictional-data demo and must not be used with real personal or health data. The API validates issuer and audience and enforces the role for each task. Tokens remain in browser memory, not local or session storage. The provider URL and role claim path can be configured with `OIDC_AUTH_SERVER_URL`, `OIDC_TOKEN_ISSUER`, `OIDC_TOKEN_AUDIENCE`, `OIDC_ROLE_CLAIM_PATH` (default `ciz_roles`), `OIDC_FRONTEND_AUTHORITY`, and `OIDC_FRONTEND_ROLE_CLAIM_PATH`; DEZI compatibility is configurable, but not established or verified by this PoC.

### Local test accounts

These credentials are **only for a local PoC with fictional data**. Do not use them in any shared or production environment.

| Component | Login | Password | Access |
| --- | --- | --- | --- |
| CIZ employee (Keycloak) | `ciz.medewerker` | `ciz-test-only` | <http://localhost:3000/ciz-medewerker> |
| Reviewer (Keycloak) | `beoordelaar` | `beoordelaar-test-only` | <http://localhost:3000/beoordelaar> |
| Keycloak administration | `admin` | `admin-local-only` | <http://localhost:8082/admin/> |
| Grafana | `admin` | `ciz-local-only` | <http://localhost:3001> (overridable with `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`) |
| Operaton web apps | `demo` | `demo` | Internal Docker network only; no host port is published. These are image defaults, **not** the CIZ employee roles. |
| MinIO console | `ciz-local` | `ciz-local-secret` | <http://localhost:9001> |

The applicant page has no login. Operaton's REST and web apps are intentionally not exposed as a browser shortcut around role protection.

## Asynchronous status updates

Completing a workflow task may create a status-change event in the case service's transactional outbox. The outbox publishes to the Kafka topic `application.status.changed`; the case service consumes that event into the applicant-facing status projection, and the applicant page refreshes the status every five seconds. A separate Apache Camel Quarkus application models administrative support by aggregating events into one-minute batches. It replaces event bodies with a count before aggregation and logs only the batch size. The local broker is Kafka-protocol-compatible Redpanda. The event schema is in `contracts/asyncapi/application-status-events.yaml`; the event contains only event ID, case ID, status, timestamp and correlation ID—no names, addresses, BSN or health information. This is an integration demonstration, not a replacement for BPMN task routing.

Kong runs DB-less with its declarative routes in `gateway/kong.yml` and has no host-published port. Browser traffic is proxied through the frontend, which only forwards case, person and task API paths; it explicitly blocks workflow, rules and document-service paths. The gateway routes those internal paths for service-to-service calls, as well as case, person and task APIs. It adds or forwards `X-Correlation-ID`; status events retain that ID across Kafka consumers. Access logs contain request metadata only and omit URLs, query parameters, and payloads. Kong performs routing and observability only—no CIZ policy, process, or business decisions.

For example, an anonymous browser request to a staff queue is rejected, and an internal workflow route is not available from the browser:

```bash
curl -i http://localhost:3000/api/tasks
curl -i http://localhost:3000/api/workflow/engine
```

The case API is exposed below `/api`; for example, these operations are available through Kong:

- `POST /api/cases` and `GET /api/cases/{caseId}`
- `POST /api/cases/address-validation` checks a Dutch postcode and house number through the case service and Camel adapter
- `GET /api/persons/{personId}/cases` lists cases linked to the same person
- CIZ-only `POST /api/cases/{caseId}/documents`; document listing and download require a CIZ or reviewer login
- `GET /api/cases/{caseId}/tasks`
- `GET /api/cases/{caseId}/medical-assessments`
- `GET /api/tasks?status=OPEN&type=REGISTRATION_ACCEPTANCE` (or another documented task type) requires a staff login and returns only tasks permitted for that role
- `GET /api/tasks/{taskId}/intake-form` (CIZ) and `/medical-assessment-form` (reviewer) for the active RegelRecht forms
- `POST /api/tasks/{taskId}/complete` requires the role owning that task; the applicant has a separate narrow route to submit a requested fictional supplement

The executable ordinary-Wlz process is versioned at `processes/wlz-aanvraag.bpmn`. Its lanes show the applicant, WP-AO/CIZ and WP-Wlz/reviewer. CIZ registers and checks the application; the reviewer triages it. If more information is needed, CIZ requests it, the applicant answers in their portal and the case returns to registration. Accepted cases proceed to triage, which routes either to investigation and substantive decision-making or directly to CIZ for outgoing communication. RuleRecht provides the current intake and medical assessment forms and explainable policy outcomes; an authorized role records the workflow route and final result. CIZ records when the decision has been sent. This PoC models only the ordinary Wlz route, not the Wlz art. 21 test route, DKIZ, Wzd or Wzd-AT.

Stop or completely reset the environment:

```bash
docker compose down
docker compose down -v
```

## Tests

Each suite is built and executed inside Docker. The address adapter tests use an in-process fake PDOK endpoint, so they need no external network. The status-notification tests check that aggregation retains only an integer count and discards event payloads:

```bash
docker compose --profile test run --rm unit-tests
docker compose --profile test run --rm document-unit-tests
docker compose --profile test run --build --rm address-validation-tests
docker compose --profile test run --build --rm status-notification-tests
docker compose --profile test run --rm contract-tests
docker compose --profile test run --rm integration-tests
docker compose --profile test run --rm e2e-tests
docker compose --profile test build ui-tests
docker compose --profile test run --rm ui-tests
```

The API-dependent suites start their required services automatically. Run all suites with `make test`; Make only wraps Docker Compose.

## Azure deploy

The infrastructure in `infra/` is pure Bicep and deploys into a dedicated resource group (`ciz-open-case-poc-dev`, `westeurope`) in the CIZ DBM sandbox subscription:

- `infra/bootstrap.bicep` creates the Log Analytics workspace, ACR, storage account with the `ciz-documents` container, the PostgreSQL flexible server with its databases, and the Container Apps environment.
- `infra/apps.bicep` deploys the five container apps (policy, document, Operaton, case, frontend) with system identities, ACR pull grants, and the Blob key as a Container Apps secret.

The document service keeps its own OpenAPI and metadata database. Its `document-s3-put` and `document-s3-get` Apache Camel routes handle S3 object transport through an AWS SDK v2 client configured with bounded timeouts and retries. The readiness check uses that same S3 client. This follows the existing route naming convention without renaming the domain service to an adapter. The S3-compatible endpoint is selected with `S3_ENDPOINT`; storage credentials remain external configuration.

CI runs the unit, adapter, contract, integration, API end-to-end and Playwright browser tests on pushes and pull requests. Azure deployment is temporarily disabled while service-principal permissions are pending: `.github/workflows/deploy.yml` has no push trigger and its deploy job is explicitly skipped. Re-enable it only after the required permissions and deployment configuration are verified.

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
- RegelRecht remains the source for the dynamic fields and conditional missing facts. For PoC usability, the frontend places those fields in a small fixed set of presentation groups; those groups contain no decision logic.
- The case service alone owns the `cases` database and runs versioned Flyway migrations at startup. Operaton owns its separate `operaton` database; neither service shares tables.
- The document service owns its `documents` database and stores binary content in a private S3 bucket. The local provider is MinIO; AWS S3 or another compatible provider can be selected through environment variables without changing application code.
- Creating a case starts `wlz-aanvraag` with only the case UUID as business key. No case payload or personal data is copied into workflow variables. The task work queues join that identifier with case data inside the case service; Operaton remains free of case payloads.
- Task rows created by milestone 2 are retained as `legacy_case_tasks` for traceability but are no longer read or written; Operaton is the sole active task source.
- The official RegelRecht Rust engine is built from a pinned source revision in the policy-service container. Every response includes the engine version, schema version, regulation hash, and the checks used for its explainable outcome.
- Medical assessments are append-only records in the case database. Each record contains the validated inputs, outcome, RegelRecht engine version, policy version and regulation hash. The decision and motivation are kept with the application; the applicant sees them after CIZ records that the decision has been sent.
- Runtime state lives in separate case, workflow, document-metadata, and S3 volumes. Policy evaluation is deterministic and stateless.
- Local distributed tracing is enabled for the Quarkus services, Camel routes, Kong, and Operaton. OpenTelemetry Collector redacts URL paths, SQL/user identifiers, client addresses and exception messages before exporting traces to Tempo. Grafana provisions Tempo and the **CIZ PoC · Requests & traces** dashboard at `http://localhost:3001/d/ciz-observability/ciz-poc-c2b7-requests-and-traces` (default local login `admin` / `ciz-local-only`; override with `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`). The dashboard shows request rate, p95 response time, error traces, and recent server requests with a service filter. Rate and latency are calculated from received traces, not an independent metrics stream. Tempo retains local traces for 48 hours. This setup exports traces only: Nginx, PostgreSQL, Redpanda, and MinIO do not currently export their own telemetry, and infrastructure metrics/logs are not collected. This setup is for local PoC use and is not production-hardened.
- Application logs go to stdout/stderr. Error responses are deliberately generic so personal data is not echoed.

## Repository scope

The local PoC intentionally does not yet include OCR, Open Zaak, RabbitMQ, or APISIX. Apache Camel handles the PDOK address lookup, S3 document transport, and the declarative Kafka status-batch mock. Supporting documents are registered by a CIZ employee; the explicit human-validated facts—not raw document contents—are supplied to RegelRecht. The included medical policy demonstrates policy-driven decision support and is not presented as a complete, production-authoritative codification of Wlz law and policy. Kong configuration here is part of the local Compose stack; the separate Azure deployment templates have not yet been extended with a gateway.

The implementation follows a configure-before-build rule: Operaton, BPMN, PostgreSQL, S3, MinIO, Flyway, Panache, Quarkus Health, Fault Tolerance, OpenTelemetry, OpenTelemetry Collector, Tempo, Grafana, OpenAPI Generator, Nginx, and Docker Compose provide the platform behavior. Custom code is limited to the Wlz form, persistence mappings, adapters, and generic Problem Details responses.

## Refreshing the CIZ corpus

Only a corpus maintainer refreshing the committed snapshot needs GitHub CLI access to the private upstream repository. Run the following from the repository root, review the corpus and manifest changes, then commit both together:

```bash
scripts/refresh-ciz-aanvraag-corpus.sh <commit-sha>
```

The script resolves the supplied revision to a full SHA through `gh`, checks out that exact commit, and records a content hash. Docker builds and runtime containers never clone the private repository.
