# Architecture

The current case domain model is documented in [the case class diagram](case-class-diagram.md).

## Current roles and dossier analysis

The current role model supersedes the historical milestone descriptions below. AO (`ciz-medewerker`) only uploads documents. The researcher (`beoordelaar`) owns registration/control, supplement requests, triage, investigation, decisions and administrative dispatch recording. POST applications are registered by the researcher; their scanned documents are uploaded by AO. Applicant channel and representation are separate concepts.

The dossier presents client/contact information in a sidebar, with expandable application, documents, client picture, impairments/limitations and assessment sections. Original OCR classification units are retained as private S3 artifacts. The impairment adapter sends those units to the existing internal RobBERT/Ernst pipeline over its documented HTTP protocol. Findings preserve document, extraction, unit, page and region references. Zero severity is distinct from an unassessed score. Human reviews are append-only; new documents or extraction versions invalidate previous analyses. Neither OCR nor analysis proposals are automatically converted into RegelRecht inputs.

The upstream source is pinned as a Git submodule at `../integrations/stoornissen_pipeline`; the model weights remain excluded from Git. Azure is not used by this local integration. The local RobBERT checkpoint must be placed at `integrations/stoornissen_pipeline/stoornis/models/stoornissen/checkpoint-400`; local service wiring in Compose is still pending. The test Compose overlay explicitly simulates the upstream; passing those tests does not prove model inference. See [adapter configuration](../impairment-analysis-adapter/README.md).

Decisions are separate append-only records linked to a case. Their profile is a string and their grounds are a list of strings. The producing task and the latest available policy/medical assessment at decision time are recorded as references; assessment facts and rule provenance remain in the assessment records. Sending marks the newest decision as sent. Migration V13 preserves existing decisions before removing their old application columns. The frontend case/decision transport types are generated from OpenAPI with `sh scripts/generate-frontend-models.sh`; Java models are generated during the container build.

This PoC minimizes custom platform code. Each milestone should first compose an established component through versioned configuration and documented contracts. Custom code is reserved for CIZ-specific user journeys, mappings, and rules that cannot be expressed by the selected component.

| Capability | Default component | Custom boundary |
| --- | --- | --- |
| Case API | Quarkus REST, generated OpenAPI interface | Case persistence mapping |
| Persistence | PostgreSQL, Panache, Flyway | Domain schema |
| Frontend delivery | React, Vite, Nginx | Applicant portal, AO upload view and BAS-inspired researcher dossier/review workspace |
| Workflow | Operaton and BPMN | Versioned BPMN model and case-to-workflow adapter |
| Document metadata | Document service and isolated PostgreSQL | Metadata persistence |
| Binary documents | S3 API; MinIO is the local provider | Validation and object references |
| Document structuring | Internal CIZ pipeline HTTP API; Apache Camel adapter, local protocol mock and opt-in local pipeline/Tesseract container using the OpenAI vision API | Untrusted source units and explicit human-reviewed transcription; CI uses simulation |
| Rules | RegelRecht | Versioned intake and medical-assessment definitions and tests |
| API gateway | Kong Gateway, DB-less | Version-controlled synchronous API routes and correlation IDs |
| Case registration (later) | Open Zaak | API mapping |
| Messaging | Kafka protocol (Redpanda locally) | AsyncAPI status event contract and outbox |
| Status notification batching | Apache Camel Quarkus Java app | Configurable aggregation window; event payloads are discarded before batching |
| Address lookup adapter | Apache Camel Quarkus Java app and PDOK Locatieserver | Provider-neutral OpenAPI lookup mapping |
| Observability | OpenTelemetry, Collector, Tempo, Grafana | Local traces across APIs, gateway, Camel, and workflow engine; Collector removes sensitive URL/query attributes |

Milestone 3 moved task ownership to Operaton. Milestone 8 replaces its original intake-review-decision sequence with the role-based Wlz process described below.

Milestone 4 adds optional supporting documents after a case exists. The case service validates the case reference and delegates through a generated OpenAPI client. The document service owns metadata and stores binary content via the S3 API. MinIO supplies that API locally, while endpoint, region, bucket and credentials are external configuration. Documents do not change the BPMN route. The later local security milestone protects upload to CIZ and reads to authenticated CIZ/reviewer accounts.

Milestone 5 turns `Aanvraag beoordelen` into an explicit medical assessment. RegelRecht supplies both the form definition and the explainable outcome; the reviewer validates the medical facts and adds a required motivation. The case service stores an immutable assessment with its policy and engine provenance, then completes the Operaton task. The CIZ employee sees the outcome before registering the administrative decision. The applicant sees it only after that registration is complete. This is decision support: neither RegelRecht nor Operaton diagnoses a person or silently converts document contents into medical facts.

Milestone 6 improves the applicant and intake journeys without introducing a generic forms engine. The applicant uses a five-step wizard for personal details, address, care question, signature/representation and final review. The case service deterministically derives presence facts from submitted case data before calling RegelRecht. The intake UI groups dynamic policy fields using versioned presentation metadata supplied by the policy service and explains missing facts using the descriptions delivered by the active policy. The grouping affects presentation only; required facts and outcomes continue to come from RegelRecht. Applicant statements about permanent supervision, signature and authorization are merely prefilled for the responsible reviewer and must be human-validated before evaluation. Evidence requirements and legal outcomes remain in RegelRecht.

Milestone 7 separates person, address, application and case records. `cases` contains the case identifier, person and address references, and creation time; personally identifying fields live in `persons` and `addresses`, while submission and care-question fields live in `applications`. One person can have several cases and addresses. The API returns those linked objects as distinct nested structures for the current UI and lists a person's cases by its stable UUID. A migration links pre-existing cases by nonempty BSN and preserves legacy cases without a BSN separately. New submissions with the same BSN reuse the person only if the date of birth matches. The separate fictional applicant demo is still unauthenticated and is not safe for real data.

Milestone 8 simplifies the ordinary Wlz route and assigns work visibly to three BPMN lanes: Aanvrager, WP-AO/CIZ-medewerker and WP-Wlz/Beoordelaar. CIZ registers and checks an application, may request a supplement, then checks it again after the applicant responds in their portal. The reviewer triages accepted applications; further investigation leads to substantive decision-making, while direct handling and non-treatment routes skip the investigation task. All paths finish with CIZ recording that the decision was sent. Operaton routes on explicit role-entered outcomes; RegelRecht supplies the active forms and explainable policy evaluations. Supplement text and personal or health data stay in the case database rather than workflow variables. Only the ordinary Wlz route is included; the Wlz art. 21 test route, DKIZ, Wzd and Wzd-AT are outside this milestone.

Milestone 9 adds Kong as a DB-less API gateway. Browser API traffic and synchronous case-service calls to Operaton, RegelRecht and the document service pass through declared `/api/...` routes. Kong adds or forwards a correlation ID and emits access metadata without request paths, query values or bodies. It owns no business or workflow logic, and does not replace service contracts. The local Compose stack publishes the frontend and gateway rather than internal service ports; the independent Azure templates are not part of this milestone.

Milestone 10 adds an optional Dutch address lookup. The applicant can submit postcode and house number from the address step through the case-service API; the case service calls an independently buildable Apache Camel Quarkus adapter through Kong. The adapter uses the PDOK Locatieserver and returns a match suggestion, no match, unsupported-country, invalid-input, or unavailable status. Suggested address fields are applied only when the applicant accepts them. The check is non-blocking and is not proof of residence. The adapter exposes the generated OpenAPI interface, Java Camel routes perform integration mapping, provider configuration is external, and tests run against an in-process fake provider. Logs omit the address query.

Milestone 11 adds asynchronous applicant-status updates. Workflow task completion writes a minimal status event to a transactional outbox; a scheduled publisher sends it to Kafka and the case service consumes it into a separate applicant-facing status projection. The UI polls only this small projection, while BPMN remains the authority for task order and routing. A separate Apache Camel Quarkus application runs the Kafka consumer that demonstrates one-minute aggregation for a mocked administrative-support application; it discards message payloads before aggregation and logs only the batch size. The AsyncAPI contract carries event ID, case ID, status, occurrence time and correlation ID. Personal and health data are deliberately excluded.

## Aanvraag, BAS en beoordeling (14 oktober 2026)

De actuele domeingrenzen, Kafka-indiening, migratie en controles zijn vastgelegd in [domain-separation.md](domain-separation.md). BAS en beoordeling hebben ieder een eigen service en PostgreSQL-database. De bovengenoemde milestones beschrijven de ontwikkelgeschiedenis; de huidige AO-rol is alleen documentupload, de onderzoeker voert de staff-taken uit.
