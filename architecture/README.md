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
| Case registration (later) | Open Zaak | API mapping |
| Messaging (later) | RabbitMQ | Versioned event contracts |
| Adapters (later) | Quarkus with Camel | External-system mappings |
| Observability (later) | OpenTelemetry, Tempo, Grafana | Dashboards and redaction policy |
| Gateway (last) | APISIX | Declarative routes and policies |

Milestone 3 moves task ownership to Operaton. Creating a case starts `wlz-aanvraag`; its business key is the case UUID and the case service maps BPMN user tasks onto the public task contract. After CIZ intake, the reviewer completes the substantive `Aanvraag beoordelen` task. This opens `Besluit administratief verwerken` for the CIZ employee; that final task does not make the substantive decision.

Milestone 4 adds optional supporting documents after a case exists. The case service validates the case reference and delegates through a generated OpenAPI client. The document service owns metadata and stores binary content via the S3 API. MinIO supplies that API locally, while endpoint, region, bucket and credentials are external configuration. Documents do not change the BPMN route. Authentication and authorization are intentionally not simulated by the role switch.

Milestone 5 turns `Aanvraag beoordelen` into an explicit medical assessment. RegelRecht supplies both the form definition and the explainable outcome; the reviewer validates the medical facts and adds a required motivation. The case service stores an immutable assessment with its policy and engine provenance, then completes the Operaton task. The CIZ employee sees the outcome before registering the administrative decision. The applicant sees it only after that registration is complete. This is decision support: neither RegelRecht nor Operaton diagnoses a person or silently converts document contents into medical facts.
