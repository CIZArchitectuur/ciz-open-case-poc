# Architecture

This PoC minimizes custom platform code. Each milestone should first compose an established component through versioned configuration and documented contracts. Custom code is reserved for CIZ-specific user journeys, mappings, and rules that cannot be expressed by the selected component.

| Capability | Default component | Custom boundary |
| --- | --- | --- |
| Case API | Quarkus REST, generated OpenAPI interface | Case persistence mapping |
| Persistence | PostgreSQL, Panache, Flyway | Domain schema |
| Frontend delivery | React, Vite, Nginx | Role-specific applicant, reviewer and employee views |
| Workflow | Operaton and BPMN | Versioned BPMN model and case-to-workflow adapter |
| Document metadata | Document service and isolated PostgreSQL | Metadata persistence |
| Binary documents | S3 API; MinIO is the local provider | Validation and object references |
| OCR (later) | OCRmyPDF/Tesseract | Extraction mapping and validation UI |
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

Milestone 6 improves the applicant and intake journeys without introducing a generic forms engine. The applicant uses a five-step wizard for personal details, address, care question, signature/representation and final review. The case service deterministically derives presence facts from submitted case data before calling RegelRecht. The intake UI groups the dynamic policy fields into four fixed presentation sections and explains missing facts using the descriptions delivered by the active policy. The grouping affects presentation only; required facts and outcomes continue to come from RegelRecht. Applicant statements about permanent supervision, signature and authorization are merely prefilled for the responsible reviewer and must be human-validated before evaluation. Evidence requirements and legal outcomes remain in RegelRecht.

Milestone 7 separates person, address, application and case records. `cases` contains the case identifier, person and address references, and creation time; personally identifying fields live in `persons` and `addresses`, while submission and care-question fields live in `applications`. One person can have several cases and addresses. The API returns those linked objects as distinct nested structures for the current UI and lists a person's cases by its stable UUID. A migration links pre-existing cases by nonempty BSN and preserves legacy cases without a BSN separately. New submissions with the same BSN reuse the person only if the date of birth matches. The separate fictional applicant demo is still unauthenticated and is not safe for real data.

Milestone 8 simplifies the ordinary Wlz route and assigns work visibly to three BPMN lanes: Aanvrager, WP-AO/CIZ-medewerker and WP-Wlz/Beoordelaar. CIZ registers and checks an application, may request a supplement, then checks it again after the applicant responds in their portal. The reviewer triages accepted applications; further investigation leads to substantive decision-making, while direct handling and non-treatment routes skip the investigation task. All paths finish with CIZ recording that the decision was sent. Operaton routes on explicit role-entered outcomes; RegelRecht supplies the active forms and explainable policy evaluations. Supplement text and personal or health data stay in the case database rather than workflow variables. Only the ordinary Wlz route is included; the Wlz art. 21 test route, DKIZ, Wzd and Wzd-AT are outside this milestone.

Milestone 9 adds Kong as a DB-less API gateway. Browser API traffic and synchronous case-service calls to Operaton, RegelRecht and the document service pass through declared `/api/...` routes. Kong adds or forwards a correlation ID and emits access metadata without request paths, query values or bodies. It owns no business or workflow logic, and does not replace service contracts. The local Compose stack publishes the frontend and gateway rather than internal service ports; the independent Azure templates are not part of this milestone.

Milestone 10 adds an optional Dutch address lookup. The applicant can submit postcode and house number from the address step through the case-service API; the case service calls an independently buildable Apache Camel Quarkus adapter through Kong. The adapter uses the PDOK Locatieserver and returns a match suggestion, no match, unsupported-country, invalid-input, or unavailable status. Suggested address fields are applied only when the applicant accepts them. The check is non-blocking and is not proof of residence. The adapter exposes the generated OpenAPI interface, Java Camel routes perform integration mapping, provider configuration is external, and tests run against an in-process fake provider. Logs omit the address query.

Milestone 11 adds asynchronous applicant-status updates. Workflow task completion writes a minimal status event to a transactional outbox; a scheduled publisher sends it to Kafka and the case service consumes it into a separate applicant-facing status projection. The UI polls only this small projection, while BPMN remains the authority for task order and routing. A separate Apache Camel Quarkus application runs the Kafka consumer that demonstrates one-minute aggregation for a mocked administrative-support application; it discards message payloads before aggregation and logs only the batch size. The AsyncAPI contract carries event ID, case ID, status, occurrence time and correlation ID. Personal and health data are deliberately excluded.
