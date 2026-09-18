workspace "CIZ Open Case PoC" "First vertical slice" {
    model {
        applicant = person "Aanvrager" "Submits and follows a fictional Wlz application."
        reviewer = person "Beoordelaar" "Handles application review tasks."
        employee = person "CIZ medewerker" "Registers decisions after review."
        system = softwareSystem "CIZ Open Case PoC" {
            frontend = container "Frontend" "Case entry and retrieval UI" "React, TypeScript, Nginx"
            caseService = container "Case service" "Owns fictional Wlz applications" "Java 21, Quarkus"
            caseDatabase = container "Case database" "Stores case-service state only" "PostgreSQL" "Database"
            workflow = container "Workflow engine" "Owns process instances and user tasks" "Operaton 2.1, BPMN"
            workflowDatabase = container "Workflow database" "Stores Operaton state only" "PostgreSQL" "Database"
            documentService = container "Document service" "Owns supporting-document metadata and storage access" "Java 21, Quarkus"
            documentDatabase = container "Document database" "Stores document metadata only" "PostgreSQL" "Database"
            objectStorage = container "S3 object storage" "Stores private binary documents" "S3 API, MinIO locally" "Database"
        }
        applicant -> frontend "Submits and follows applications" "HTTPS"
        reviewer -> frontend "Completes assessment tasks" "HTTPS"
        employee -> frontend "Registers decisions" "HTTPS"
        frontend -> caseService "Creates cases and manages optional documents" "JSON and binary/HTTPS, OpenAPI"
        caseService -> caseDatabase "Reads and writes its own data" "JDBC"
        caseService -> workflow "Starts workflows and handles tasks" "JSON/HTTP, generated REST client"
        workflow -> workflowDatabase "Reads and writes its own state" "JDBC"
        caseService -> documentService "Stores, lists and retrieves documents" "HTTP, generated OpenAPI client"
        documentService -> documentDatabase "Reads and writes its own metadata" "JDBC"
        documentService -> objectStorage "Stores and retrieves document bytes" "S3 API"
    }
    views {
        container system "Containers" {
            include *
            autoLayout lr
        }
        styles {
            element "Person" { shape Person }
            element "Database" { shape Cylinder }
        }
    }
}
