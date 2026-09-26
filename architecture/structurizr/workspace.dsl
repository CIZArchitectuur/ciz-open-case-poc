workspace "CIZ Open Case PoC" "Container-based ordinary Wlz application flow" {
    model {
        applicant = person "Aanvrager" "Submits and follows a fictional Wlz application."
        reviewer = person "WP-Wlz / Beoordelaar" "Triages accepted applications and performs investigation and substantive decision-making when needed."
        employee = person "WP-AO / CIZ medewerker" "Registers and checks applications, requests missing information and records outgoing decisions."
        pdok = softwareSystem "PDOK Locatieserver" "Public Dutch address lookup; only used for optional suggestions."
        system = softwareSystem "CIZ Open Case PoC" {
            frontend = container "Frontend" "Applicant portal and role-specific CIZ/reviewer work queues" "React, TypeScript, Nginx"
            identityProvider = container "Identity provider" "Authenticates CIZ employees and reviewers using OIDC Authorization Code with PKCE" "Keycloak locally; DEZI-ready OIDC configuration"
            gateway = container "API gateway" "Routes synchronous browser and service API calls" "Kong Gateway, DB-less"
            caseService = container "Case service" "Owns person, address, application and case records; maps Operaton tasks and status events" "Java 21, Quarkus, generated OpenAPI clients"
            caseDatabase = container "Case database" "Stores case-service state only" "PostgreSQL" "Database"
            kafka = container "Event broker" "Distributes minimal application status events" "Kafka protocol, Redpanda locally"
            statusBatch = container "Administrative support batch mock" "Consumes status events and aggregates a batch for a mocked hand-off" "Apache Camel Quarkus"
            workflow = container "Workflow engine" "Owns process instances and user tasks" "Operaton 2.1, BPMN"
            workflowDatabase = container "Workflow database" "Stores Operaton state only" "PostgreSQL" "Database"
            policyService = container "Policy service" "Executes versioned rules using RegelRecht" "RegelRecht"
            addressAdapter = container "Address validation adapter" "Looks up Dutch postcode and house number suggestions; never blocks manual entry" "Apache Camel Quarkus, PDOK Locatieserver"
            documentService = container "Document service" "Owns supporting-document metadata and uses Camel routes for S3 object transfer" "Java 21, Quarkus, Apache Camel"
            documentDatabase = container "Document database" "Stores document metadata only" "PostgreSQL" "Database"
            objectStorage = container "S3 object storage" "Stores private binary documents" "S3 API, MinIO locally" "Database"
            telemetry = container "Telemetry pipeline" "Receives and exports traces while removing sensitive request attributes" "OpenTelemetry Collector, Tempo"
            dashboard = container "Observability dashboard" "Shows provisioned service and workflow traces" "Grafana"
        }
        applicant -> frontend "Submits and follows applications" "HTTPS"
        reviewer -> frontend "Signs in and completes triage and investigation tasks" "OIDC / HTTPS"
        employee -> frontend "Signs in, registers applications and records outgoing decisions" "OIDC / HTTPS"
        frontend -> identityProvider "Authenticates staff; tokens held in memory" "OIDC Authorization Code + PKCE"
        frontend -> gateway "Calls public case, person and task APIs" "JSON and binary/HTTP"
        gateway -> caseService "Routes case, person and task APIs" "HTTP, OpenAPI"
        caseService -> gateway "Calls workflow, rules and document APIs" "HTTP, documented API contracts"
        caseService -> gateway "Requests optional address lookup" "HTTP, OpenAPI"
        caseService -> caseDatabase "Reads and writes its own data" "JDBC"
        caseService -> kafka "Publishes and consumes outbox-backed status events" "Kafka, AsyncAPI"
        statusBatch -> kafka "Consumes and batches status changes" "Kafka, AsyncAPI"
        gateway -> workflow "Routes workflow API calls" "JSON/HTTP, Operaton REST"
        workflow -> workflowDatabase "Reads and writes its own state" "JDBC"
        gateway -> documentService "Routes document API calls" "HTTP, generated OpenAPI client"
        gateway -> policyService "Routes policy API calls" "HTTP, generated OpenAPI client"
        gateway -> addressAdapter "Routes postcode lookup calls" "HTTP, generated OpenAPI client"
        addressAdapter -> pdok "Looks up postcode and house number" "HTTPS"
        documentService -> documentDatabase "Reads and writes its own metadata" "JDBC"
        documentService -> objectStorage "Stores and retrieves document bytes through Camel S3 routes" "S3 API"
        frontend -> telemetry "Exports browser traces without personal or case payloads" "OTLP"
        gateway -> telemetry "Exports gateway traces" "OTLP"
        caseService -> telemetry "Exports API and workflow-adapter traces" "OTLP"
        documentService -> telemetry "Exports document API traces" "OTLP"
        addressAdapter -> telemetry "Exports provider-adapter traces" "OTLP"
        statusBatch -> telemetry "Exports batch-processing traces" "OTLP"
        telemetry -> dashboard "Provides trace data" "OTLP / Tempo datasource"
    }
    views {
        container system "Containers" {
            include *
            autoLayout lr
        }
    }
}
