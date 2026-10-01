# Actueel klassendiagram van zaken

Gecontroleerd op 30 september 2026 aan de hand van de huidige Java-entiteiten. Nederlandse namen zijn weergavenamen; de opgeslagen velden staan met hun namen uit de code in het diagram. Technische outbox-records en enkele tijdstempels zijn voor de leesbaarheid weggelaten.

```mermaid
classDiagram
    direction LR
    class Persoon {
        UUID personId
        String citizenServiceNumber
        String clientName
        String lastName
        String initials
        LocalDate birthDate
    }
    class Adres {
        UUID addressId
        UUID personId
        String street
        String houseNumber
        String postalCode
        String city
        String country
    }
    class Zaak {
        UUID caseId
        UUID personId
        UUID addressId
        Instant createdAt
    }
    class Aanvraag {
        UUID applicationId
        UUID caseId
        String applicantId
        String applicantRole
        String signedBy
        Boolean authorizationSignedByClient
        boolean permanentCareNeed
        boolean permanentSupervision
        Instant submittedAt
        String applicantStatus
        String supplementRequest
        String supplementResponse
    }
    class Besluit {
        UUID decisionId
        UUID caseId
        String result
        String motivation
        String zorgprofiel
        List~String~ grondslagen
        Instant decidedAt
        Instant sentAt
        UUID sourceTaskId
        UUID policyEvaluationId
        UUID medicalAssessmentId
    }
    class Beleidsbeoordeling {
        UUID evaluationId
        UUID caseId
        UUID taskId
        JSON facts
        JSON resolvedInputs
        JSON outputs
        boolean canBeTakenIntoConsideration
        String policyVersion
        String engineVersion
        String schemaVersion
        String regulationHash
        LocalDate effectiveDate
        Instant evaluatedAt
    }
    class MedischeBeoordeling {
        UUID assessmentId
        UUID caseId
        UUID taskId
        JSON facts
        JSON resolvedInputs
        JSON outputs
        boolean assessmentComplete
        boolean criteriaMet
        boolean medicalAdviceRequired
        String policyVersion
        String engineVersion
        String schemaVersion
        String regulationHash
        LocalDate effectiveDate
        Instant assessedAt
    }
    class ProcesTaak {
        <<Operaton>>
        UUID taskId
        UUID caseId
        TaskType type
        TaskStatus status
    }
    class Document {
        <<documentservice>>
        UUID documentId
        UUID caseId
        String objectKey
        String fileName
        String contentType
        long size
        String sha256
        Instant createdAt
    }
    Persoon "1" -- "0..*" Zaak : client van
    Persoon "1" -- "0..*" Adres : adressen
    Zaak "0..*" --> "1" Adres : adres bij aanvraag
    Zaak "1" -- "1" Aanvraag : aanvraag
    Zaak "1" -- "0..*" Besluit : besluiten
    Besluit "0..*" --> "0..1" Beleidsbeoordeling : onderbouwing
    Besluit "0..*" --> "0..1" MedischeBeoordeling : onderbouwing
    Besluit "0..*" ..> "0..1" ProcesTaak : geproduceerd vanuit
    Zaak "1" -- "0..*" Beleidsbeoordeling : controles
    Zaak "1" -- "0..*" MedischeBeoordeling : beoordelingen
    Zaak "1" .. "0..*" ProcesTaak : workflow
    Beleidsbeoordeling "0..*" ..> "1" ProcesTaak : taskId
    MedischeBeoordeling "0..*" ..> "1" ProcesTaak : taskId
    Zaak "1" .. "0..*" Document : API-koppeling
```

Een persoon kan meerdere zaken hebben. De zaak bevat alleen identificatie, verwijzingen en de aanmaaktijd. Elke nieuwe aanvraag krijgt een eigen adresrecord en een eigen zaak.

Een besluit is een afzonderlijk record. Nieuwe besluitvorming voegt een besluit toe; verzending markeert het nieuwste besluit. Zorgprofiel en grondslagen zijn eenvoudige tekstwaarden. Een besluit verwijst naar de laatste beschikbare beleids- en medische beoordeling op het moment van besluitvorming en naar de producerende taak. Deze beoordelingen behouden hun feiten, uitkomsten en regelversies; latere beoordelingen veranderen de verwijzingen van oudere besluiten niet.

Ten opzichte van het eerder aangeleverde wensdiagram zijn er deze concrete verschillen:

- Er is geen abstracte opgeslagen klasse `Beoordeling`; beleidsbeoordelingen en medische beoordelingen zijn afzonderlijke entiteiten met vergelijkbare herkomstvelden.
- Vertegenwoordiging en ondertekening staan als velden op `Aanvraag`; er is geen afzonderlijke `Vertegenwoordiging`-entiteit. De aanvrager is een `applicantId`, niet een aparte relatie naar een tweede `Persoon`.
- De voortgangsstatus staat op `Aanvraag` als `applicantStatus`. Operaton beheert de procesvolgorde en taken.
- Taken en documentmetadata zijn eigendom van andere diensten. De gestippelde relaties zijn verwijzingen via API's en identifiers, geen gedeelde database-relaties.

Bronnen: `case-service/src/main/java/nl/ciz/caseapi/*Entity.java`, `document-service/src/main/java/nl/ciz/document/DocumentEntity.java` en de frontend-transporttypen voor `CaseTask`.
