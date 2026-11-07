# CIZ Open Case PoC

Container-first proof of concept for a fictional Wlz application. The current vertical slice creates and retrieves cases, stores supporting documents through the S3 protocol, checks Dutch addresses through an Apache Camel Quarkus/PDOK adapter, evaluates policy rules against validated intake and medical facts with RegelRecht, and runs the resulting workflow in Operaton. Professional and medical judgments remain human inputs. It also demonstrates asynchronous applicant-status events over Kafka, with an independent Apache Camel Quarkus batch consumer for a mocked administrative-support application. Each integration capability is packaged in its own immutable application image; Camel routes and supporting Java code are included at build time. It contains a React frontend, Kong API gateway, independent Quarkus case, document, policy and Camel integration services, Operaton, Kafka-compatible Redpanda, isolated PostgreSQL databases, versioned OpenAPI and AsyncAPI contracts, Flyway migrations, health endpoints, and containerized tests.

## Feature overview

| Component | Current PoC capability |
| --- | --- |
| React frontend | Applicant wizard and progress; AO upload-only screen; BAS-geïnspireerde onderzoekerwerkplek with dossier/client sidebar, documents and recognized text side by side, impairment findings and human review. This is a PoC layout, not a full BAS replacement. |
| Kong API gateway | Declarative API routing, correlation IDs and tracing. Rate limiting is not yet configured; Kong has no public host port. |
| Apache Camel address adapter | Dutch postcode and house-number lookup through PDOK. Suggestions require confirmation; manual entry remains possible. |
| Apache Camel document-structuring adapter | Starts PDF processing and polls the internal pipeline API; a protocol mock is the default for CI. An optional local pipeline container runs Tesseract and calls the OpenAI vision API. Staff review extracted source fragments; no automatic policy-fact mapping. |
| Stoornissenpipeline + Camel adapter | Upstream `stoornissen_pipeline` source pinned as a Git submodule at `integrations/stoornissen_pipeline`; the adapter preserves source provenance and separates proposals from human-reviewed scores. Local model execution is not wired into Compose yet; CI uses an explicit simulation. |
| RegelRecht / policy service | Versioned policy evaluation based on validated case facts, including evaluation provenance, intermediate results and explanations. Professional/medical judgments remain human inputs and are not inferred by the rule engine. |
| Operaton | Executable Wlz process orchestration: role-based task routing, supplementary-information loops, triage, investigation and administrative dispatch recording. Policy decisions are delegated to the policy service rather than encoded in BPMN. |
| Workflow-start adapter + separate PostgreSQL | Independent Kafka consumer that starts Operaton asynchronously after definitive submission. Durable receipts, bounded retries and deduplication isolate submission from workflow availability. |
| Kafka-compatible Redpanda | Application-status, document-receipt and submitted-document-snapshot events. Independent workflow-start and BAS consumers, transactional outbox, idempotent processing and versioned reruns; medical advice is not delivered through Kafka yet. |
| Apache Camel status adapter | Independent consumer that batches status-event counts for mocked administrative support. |
| Keycloak | Local OIDC login with PKCE and API-enforced AO/researcher roles. Applicant access remains a fictional-data demo; DEZI integration is not verified. |
| Case service + PostgreSQL | Persons, addresses, application drafts and cases. Client and care-provider portals follow the same wizard; attachments are stored before definitive submission. |
| BAS service + separate PostgreSQL | Reusable metadata, OCR and dossier-analysis functions with explicit component selection and versioned reruns. Kafka starts document processing at receipt; dossier analysis waits for definitive submission and ready sources. |
| Assessment service + separate PostgreSQL | Owns policy/medical evaluation provenance, multiple decisions per case and dispatch audit. Case APIs expose this data through Kong. |
| Document service + separate PostgreSQL database | Document metadata and links to cases and stored objects; independent from the case database. |
| S3-compatible MinIO | Storage of document files; the document database stores metadata, not the files themselves. |
| OpenTelemetry, Tempo and Grafana | Configured distributed tracing and dashboards for the instrumented components; not a guarantee of complete monitoring of every component. |
| Structurizr and Mermaid | Version-controlled architecture views and domain class diagram. |
| Docker Compose, automated tests and Playwright | Reproducible container-based environment, contract/integration/chain/UI checks and a visible Wlz browser demo. |

The implemented process covers a deliberately simplified **ordinary Wlz** flow. DKIZ, Wlz art. 21, Wzd and Wzd-AT are outside the current scope. The local mock is the default for automated tests. The optional OpenAI overlay has also been exercised with real PDF text recognition and fragment extraction through the included document-structuring pipeline. This demonstrates the integration, not OCR accuracy or clinical validity. Extracted text is untrusted and requires researcher review; it is not automatically converted into policy facts. Real external dispatch and asynchronous medical-advice exchange are not implemented. Use fictional data; the approved, non-identifiable upstream PDF fixture is documented separately.

### Document extraction and human review

AO selects an existing case and uploads received PDF/JPEG/PNG documents, including scanned post. AO has no task-completion or content-review authority. The **Onderzoeker** opens the dossier, checks the application and documents, requests supplements, triages, investigates, records decisions and administratively records dispatch. Existing login names/claim values (`ciz-medewerker`, `beoordelaar`) remain stable; their permissions and UI labels change. Document upload itself does not complete a process task.

The dossier uses a BAS-inspired research layout: a compact client/contact sidebar, with source documents and recognized text next to the assessment workspace, plus expandable application, client-picture, impairment and decision sections. **Document uitlezen** belongs to the researcher; AO only uploads. OCR recognizes text from PDFs (including scanned pages where image OCR is needed) and presents it as reviewable fragments grouped by subdocument/page beside the source PDF. The researcher compares the text with the original and explicitly confirms or corrects it. Page numbers from split subdocuments are not assumed to be original-PDF page numbers. The default `pipeline-mock` returns clearly labelled simulation text; the optional OpenAI overlay performs actual extraction. Confirmation records a review, but does not make the text a validated policy fact or automatically pass it to RegelRecht.

Original documents and unsplit OCR provenance artefacts are stored in S3 through the documentservice. The BAS database stores extraction metadata, presentation text and audit. A failed or legacy extraction lacking source artefacts can be rerun without deleting its history. Reviewed text is **not automatically passed to RegelRecht**. New BPMN definitions assign all staff tasks to the researcher; already-running instances retain their original engine assignment and are not migrated automatically. Use new cases for the updated demo.

### Stoornissen and limitations

The researcher selects **Dossier analyseren** after OCR is ready for all source PDFs. The BAS service queues a durable analysis job and calls the independent [impairment adapter](impairment-analysis-adapter/README.md) through Kong. Original classification units, document identities and extraction versions are preserved. Scores come from the upstream **Ernst** stage, while **RobBERT** classifies domains; zero means no limitation, and an empty score means unassessed. The researcher confirms, adjusts or rejects proposals, or adds source-linked findings manually. Proposals remain immutable and reviews are appended with actor/time audit. New documents or extraction versions mark old analyses stale and prevent review until a new analysis is run.

The upstream source is included at `integrations/stoornissen_pipeline` as a pinned submodule, including its `ZP_decoder` submodule. On a fresh checkout use `git clone --recurse-submodules`. To enable local RobBERT execution, place the checkpoint at `integrations/stoornissen_pipeline/stoornis/models/stoornissen/checkpoint-400`; upstream `.gitignore` excludes those weights. Local Compose wiring is the next step after the checkpoint is available. The adapter contract follows upstream `/process-file`, not the care-profile decoder with its default grondslag. Zorgprofiel and grondslagen remain decision fields entered by the researcher. CI uses `compose.analysis-test.yaml`, explicitly labelled **Simulatie voor contracttests — RobBERT is niet uitgevoerd**.

The adapter uses the upstream `POST /api/process_pdfs`, `GET /api/process_status/{jobId}` and ADR-0022 run-result endpoints, not the Azure intake Function. Submission is not retried automatically because the upstream submit API is not idempotent. Reads have bounded timeouts; transient failures can be retried by polling. Pending processing expires after one hour. Results above 200 fragments, 10,000 characters per fragment or 5 MB per response are rejected rather than silently truncated.

To connect an existing private pipeline service, configure `PIPELINE_BASE_URL` with its HTTPS base URL, `PIPELINE_MOCK=false`, `PIPELINE_VERSION` with the deployed commit/image version and optionally `PIPELINE_CONFIG_JSON` with the reviewed pipeline configuration. Redeploy with `docker compose up -d --build`. No internal endpoint or credentials are included in Git. The upstream webapp currently has no authentication; use a private, access-controlled network. If the deployment requires an authentication mechanism, add it to the adapter before connecting; the PoC does not currently implement upstream credentials.

By default all local synchronous service calls use Kong, including the adapter-to-mock route. The pipeline and adapter have no host ports. Do not expose the upstream validator UI or its full-document APIs publicly. No original filenames, upstream logs or filesystem paths are returned by the adapter; only bounded text fragments and provenance are returned to authorized staff. Subdocument page numbers may differ from the original PDF. This first slice downloads the original PDF, not the pipeline's transformed subdocument PDFs, and does not offer coordinate highlighting.

An optional **OpenAI API document-processing route** is documented in the [OCR setup guide](document-pipeline/README.md). It sends document content externally and requires a separate API key and API billing; the key must be supplied through the local shell environment, never committed. Use fictional test documents only. OCR output is untrusted and does not become a validated policy fact without staff review. The default deterministic mock remains available for local development and CI.

The approved upstream fixture and its pinned source/hash are in `tests/fixtures/ocr/README.md`. Containerized integration tests use it to verify the protocol and role separation, not OCR accuracy. Run:

```bash
docker compose --profile test run --build --rm document-structuring-tests
docker compose -f compose.yaml -f compose.analysis-test.yaml --profile test run --build --rm integration-tests
```

For an already-running local Keycloak realm, apply the version-controlled subject mapper once before testing review audit (new clean environments import it automatically):

```bash
docker compose --profile test run --rm --no-deps \
  -v "$PWD/tests/local_keycloak_config.py:/local_keycloak_config.py:ro" \
  -v "$PWD/security/keycloak/import:/realm:ro" \
  integration-tests python /local_keycloak_config.py
```

Sign in again afterwards. Audit stores the validated token's opaque subject identifier, not the token or the employee's name. Existing pipeline deployments must also be checked for payload logging and appropriate access controls before use.

### Architectural intent

This PoC intentionally separates process orchestration, policy evaluation, case state, document storage, integration and asynchronous messaging. Components communicate through explicit APIs and events and do not share databases. Runtime configuration is reproducible from Git; graphical tools are optional views rather than the source of truth. The goal is to evaluate whether a modular, code-first and AI-assisted engineering approach can support CIZ case handling without concentrating these responsibilities in a single application platform.

## Domain separation and definitive submission

See [Aanvraag, BAS en beoordeling](architecture/domain-separation.md) for domain ownership, draft/upload/submit APIs, Kafka events, historical migration and test commands. Document metadata is available at upload and `DocumentReceived` starts OCR; dossier analysis waits for definitive submission and ready source documents. Different callers can select components and request versioned reruns through the internal BAS API. Policy form groups are presentation metadata supplied by the policy service, while required facts and outcomes remain in RegelRecht. OCR presentation is normalized into readable text without changing the stored source result. Definitive submission also reaches Operaton through an independent Kafka consumer, not a synchronous application-service call. Tasks can appear shortly after submission; the overview refreshes automatically. See [workflow-start recovery](workflow-start-adapter/README.md) and run `sh scripts/test-workflow-async.sh` for outage/replay verification.

## Prerequisites

Only Git and Docker with Docker Compose are required. Java, Maven, Node.js, npm, Python, and PostgreSQL run exclusively inside containers.

The internal [`stoornissen_pipeline`](integrations/stoornissen_pipeline) source is pinned as a submodule. Initialize submodules when cloning (`git clone --recurse-submodules`) or run `git submodule update --init --recursive` in an existing checkout. The private model checkpoint is not committed; see the path above.

## Start

```bash
docker compose up --build
```

Open the application at <http://localhost:3000>. Keycloak is available at <http://localhost:8082> for local OIDC sign-in. Browser requests go through the frontend proxy to Kong, which is internal to Docker and has no host-published port. Only the fictional applicant demo endpoints and the role-protected case task API are exposed through the browser; workflow, rules and document-service routes are not browser routes.
The frontend has separate routes for the client applicant (`/aanvrager`), care provider (`/zorgaanbieder`), researcher and AO. Both applicant routes use the same five-step application wizard. The applicant submits the identifying details, address and initial care question through a five-step wizard, can answer a CIZ request for more information in the portal, resumes the application through its bookmarked URL, and sees the progress and sent decision. Presence checks for submitted personal details, application date and requested Wlz care are supplied automatically to RegelRecht. AO uploads PDF, JPEG, or PNG documents received from a care provider, representative, post, or another source. The researcher registers and checks the application, then reviews the documents. Client and care-provider portals can attach documents before definitive submission and when responding to a supplement request; AO uploads documents received outside those portals. The Operaton REST API can be reached through `/api/workflow`; Kong has no process or business logic. The local S3-compatible MinIO console is at <http://localhost:9001> (`ciz-local` / `ciz-local-secret`).

- Applicant: <http://localhost:3000/aanvrager>
- Onderzoeker: <http://localhost:3000/beoordelaar>
- AO (upload only): <http://localhost:3000/ciz-medewerker>

The applicant wizard also records who submits and signs the application. Relevant follow-up questions are shown conditionally. These statements prefill the RegelRecht-driven intake, but the researcher must still validate representation and supporting evidence before running the policy check. In the address step the applicant can optionally check a Dutch postcode and house number through the PDOK Locatieserver. A returned street and city are suggestions that must be accepted explicitly; a no-match, unsupported country, or provider outage never blocks manual entry or submission. This is a lookup aid, not proof of residence or identity.

Employee and reviewer work queues use OIDC Authorization Code with PKCE. The applicant portal remains an unauthenticated fictional-data demo and must not be used with real personal or health data. The API validates issuer and audience and enforces the role for each task. Tokens remain in browser memory, not local or session storage. The provider URL and role claim path can be configured with `OIDC_AUTH_SERVER_URL`, `OIDC_TOKEN_ISSUER`, `OIDC_TOKEN_AUDIENCE`, `OIDC_ROLE_CLAIM_PATH` (default `ciz_roles`), `OIDC_FRONTEND_AUTHORITY`, and `OIDC_FRONTEND_ROLE_CLAIM_PATH`; DEZI compatibility is configurable, but not established or verified by this PoC.

### Local test accounts

These credentials are **only for a local PoC with fictional data**. Do not use them in any shared or production environment.

| Component | Login | Password | Access |
| --- | --- | --- | --- |
| AO, upload only (Keycloak) | `ciz.medewerker` | `ciz-test-only` | <http://localhost:3000/ciz-medewerker> |
| Onderzoeker, all controls/tasks (Keycloak) | `beoordelaar` | `beoordelaar-test-only` | <http://localhost:3000/beoordelaar> |
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
- AO/CIZ-only `POST /api/cases/{caseId}/documents`; document listing and download require an AO/CIZ or researcher login
- `GET /api/cases/{caseId}/tasks`
- `GET /api/cases/{caseId}/medical-assessments`
- `GET /api/tasks?status=OPEN&type=REGISTRATION_ACCEPTANCE` (or another documented task type) requires a staff login and returns only tasks permitted for that role
- `GET /api/tasks/{taskId}/intake-form` (Onderzoeker) and `/medical-assessment-form` (reviewer) for the active RegelRecht forms
- `POST /api/tasks/{taskId}/complete` requires the role owning that task; the applicant has a separate narrow route to submit a requested fictional supplement

The executable ordinary-Wlz process is versioned at `processes/wlz-aanvraag.bpmn`. The applicant submits and answers supplement requests. The researcher owns every staff task: control, requesting information, triage, investigation/decision and administrative dispatch recording. AO uploads documents independently of the task flow. Supplement provision loops back to researcher control. Triage skips investigation for direct handling or non-consideration. RegelRecht provides policy checks; OCR and impairment results are untrusted proposals until reviewed and are not mapped automatically into rule facts. This remains an ordinary Wlz PoC; DKIZ and other routes are outside scope.

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

To follow the ordinary Wlz Playwright scenario live in a browser, start the dedicated local demo profile:

```bash
docker compose --profile demo up --build ui-demo
```

Open <http://localhost:6080/vnc.html?autoconnect=true&resize=scale&view_only=true> when the terminal reports that the demo screen is ready. Playwright begins 15 seconds later and shows the ordinary Wlz route in this order. The researcher stages use the BAS-inspired dossier layout so viewers can see the original PDF, recognized text and assessment together:

1. The applicant fills in the five-step application form and submits it.
2. The AO selects the case and uploads the approved example PDF to S3 through the document service.
3. The researcher registers and checks the application, then triages it to planned investigation.
4. In the BAS-inspired investigation workspace, the researcher starts PDF uitlezen and views the original PDF alongside recognized text fragments, including their source references. The mock profile labels its text as simulated; the optional OpenAI profile runs actual PDF extraction.
5. The researcher compares fragments with the source and explicitly confirms the review. This records a human review; it does not certify medical truth or automatically supply policy facts.
6. The researcher records investigation findings and a decision.
7. The researcher records administratively that the decision was sent.
8. The applicant sees progress and the final outcome.

The active role and action appear in a banner; the researcher policy check shows its field count and scrolls to each field. Use the noVNC fullscreen button to make the application easier to read. The completed applicant result remains visible for 90 seconds. The VNC connection is view-only so clicks in the viewer cannot interrupt the scenario. Stop the run with Ctrl+C in the terminal. The VNC page is published only on localhost. This demo creates one fictitious case and does not clear or overwrite existing database data.

For the same visible demo with real PDF processing through the optional OpenAI-backed pipeline, use the `.env` key and authenticated GitHub CLI to build the private pipeline image:

```bash
GH_TOKEN="$(gh auth token)" docker compose -f compose.yaml -f compose.ocr-openai.yaml --profile demo up --build ui-demo
```

This sends the demo PDF to OpenAI and may incur API charges. Use only the fictional fixture in the demo; never use real personal or medical documents. The result remains untrusted and requires explicit human review. The OCR overlay health-checks the pipeline's listening port because the upstream service does not expose a health endpoint.

## Azure deploy

The manually triggered [Azure deploy workflow](.github/workflows/deploy.yml) runs
CI, deploys to the existing `ciz-open-case-poc-dev` resource group using the
`github-ciz-open-case-poc` service principal with OIDC, then verifies the deployed
API, authentication, document storage and asynchronous workflow.

The Bicep templates configure VNet-integrated Container Apps on the Consumption
workload profile, one public frontend, one static NAT egress IP, private PostgreSQL,
Event Hubs' Kafka interface, and an internal S3-compatible MinIO service with
persistent Azure Files storage. HTTP services can scale to zero; background
consumers retain one replica. OCR and impairment analysis use labelled mocks.

See [Azure deployment configuration](infra/README.md) for required secrets,
federation, cost choices, migration limitations and the exact verification scope.
A passing local template check is not evidence of a successful live deployment.

```sh
docker compose --profile test run --build --rm deployment-tests
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
- Definitive submission commits an outbox event; the independent workflow-start adapter consumes it through Kafka and starts `wlz-aanvraag` with only the case UUID as business key. Draft creation and reading tasks never start a process. No case payload or personal data is copied into workflow variables. The task work queues join that identifier with case data inside the case service; Operaton remains free of case payloads.
- Task rows created by milestone 2 are retained as `legacy_case_tasks` for traceability but are no longer read or written; Operaton is the sole active task source.
- The official RegelRecht Rust engine is built from a pinned source revision in the policy-service container. Every response includes the engine version, schema version, regulation hash, and the checks used for its explainable outcome.
- Medical and policy assessments are append-only records in the case database with their validated inputs and rule/engine provenance. Decisions are separate append-only `Besluit` records linked to a case, with result, motivation, care profile, grounds and references to the task and available assessments. The applicant sees the decision after the researcher records that it has been sent.
- Runtime state lives in separate case, workflow, document-metadata, and S3 volumes. Policy evaluation is deterministic and stateless.
- Local distributed tracing is enabled for the Quarkus services, Camel routes, Kong, and Operaton. OpenTelemetry Collector redacts URL paths, SQL/user identifiers, client addresses and exception messages before exporting traces to Tempo. Grafana provisions Tempo and the **CIZ PoC · Requests & traces** dashboard at `http://localhost:3001/d/ciz-observability/ciz-poc-c2b7-requests-and-traces` (default local login `admin` / `ciz-local-only`; override with `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`). The dashboard shows request rate, p95 response time, error traces, and recent server requests with a service filter. Rate and latency are calculated from received traces, not an independent metrics stream. Tempo retains local traces for 48 hours. This setup exports traces only: Nginx, PostgreSQL, Redpanda, and MinIO do not currently export their own telemetry, and infrastructure metrics/logs are not collected. This setup is for local PoC use and is not production-hardened.
- Application logs go to stdout/stderr. Error responses are deliberately generic so personal data is not echoed.

## Repository scope

The base local Compose profile uses a labelled OCR protocol mock; the optional `compose.ocr-openai.yaml` profile builds and runs the internal document-structuring pipeline locally with Tesseract while calling the OpenAI API for vision-capable extraction. That demonstrates a real provider-backed integration, not validated OCR accuracy. Local RobBERT/Ernst inference is not wired into Compose; analysis contract tests explicitly simulate that upstream. Open Zaak, RabbitMQ, APISIX, real external dispatch and asynchronous medical-advice exchange are outside the current PoC. Apache Camel handles PDOK address lookup, S3 document transport, PDF pipeline integration, and the Kafka status-batch mock. AO uploads supporting documents; the researcher validates facts before they are supplied to RegelRecht. The included medical policy demonstrates decision support and is not a complete, production-authoritative codification of Wlz law and policy. Kong configuration is shared with Azure through a container build that translates upstream hostnames to internal Container Apps names.

The implementation follows a configure-before-build rule: Operaton, BPMN, PostgreSQL, S3, MinIO, Flyway, Panache, Quarkus Health, Fault Tolerance, OpenTelemetry, OpenTelemetry Collector, Tempo, Grafana, OpenAPI Generator, Nginx, and Docker Compose provide the platform behavior. Custom code is limited to the Wlz form, persistence mappings, adapters, and generic Problem Details responses.

## Refreshing the CIZ corpus

Only a corpus maintainer refreshing the committed snapshot needs GitHub CLI access to the private upstream repository. Run the following from the repository root, review the corpus and manifest changes, then commit both together:

```bash
scripts/refresh-ciz-aanvraag-corpus.sh <commit-sha>
```

The script resolves the supplied revision to a full SHA through `gh`, checks out that exact commit, and records a content hash. Docker builds and runtime containers never clone the private repository.
