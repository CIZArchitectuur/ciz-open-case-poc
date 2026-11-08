# Actueel klassendiagram van zaken

Bijgewerkt op 14 oktober 2026. Persoon, Adres, Aanvraag en Zaak worden door de zaakservice opgeslagen. Beleidsbeoordeling, MedischeBeoordeling en Besluit worden via de assessment-service in een eigen database opgeslagen. BAS heeft een eigen database voor OCR, dossieranalyses en menselijke broncontroles. Relaties tussen domeinen zijn identificaties via API's en events; er zijn geen gedeelde databases. Historische records worden idempotent via import-API's overgenomen. Technische outbox-records zijn voor de leesbaarheid weggelaten.

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
    class DocumentExtractie {
        UUID extractionId
        UUID caseId
        UUID documentId
        Instant createdAt
        JSON result
        String reviewedText
        String reviewedBy
        Instant reviewedAt
        UUID artifactId
    }
    class DossierAnalyse {
        UUID analysisId
        UUID caseId
        Instant createdAt
        String status
        JSON documentSnapshot
        JSON proposalsWithSources
        String pipelineVersion
        String classifierModel
        JSON humanReviewHistory
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
    Zaak "1" -- "0..*" DocumentExtractie : extracties
    Zaak "1" -- "0..*" DossierAnalyse : analysehistorie
    DossierAnalyse "0..*" ..> "1..*" DocumentExtractie : gebruikte versies
    DocumentExtractie "0..*" ..> "1" Document : documentId
```

Een persoon kan meerdere zaken hebben. De zaak bevat alleen identificatie, verwijzingen en de aanmaaktijd. Elke nieuwe aanvraag krijgt een eigen adresrecord en een eigen zaak.

Aanvraag bevat ook `submissionChannel` (cliëntportaal, zorgaanbieder of post), onafhankelijk van indiener en ondertekenaar. Een concept heeft nog geen `submittedAt` en geen workflow. Cliënt en zorgaanbieder kunnen bijlagen bij hun aanvraag of gevraagde aanvulling voegen; AO uploadt buiten de portalen ontvangen documenten. De Onderzoeker controleert en behandelt de aanvraag. Originale OCR-eenheden staan als JSON-artefact in S3 via de documentservice. BAS bewaart document-/extractieversies, onbetrouwbare voorstellen met bronverwijzingen en een append-only menselijke reviewhistorie. Een ernstscore kan 0–4 of leeg (niet beoordeeld) zijn. Dit introduceert geen extra CIZ/BI-model: stoornissen en beperkingen blijven eenvoudige bevindingen binnen het analyseresultaat, afzonderlijk van bevestigde RegelRecht-feiten.

Een besluit is een afzonderlijk record. Nieuwe besluitvorming voegt een besluit toe; verzending markeert het nieuwste besluit. Zorgprofiel en grondslagen zijn eenvoudige tekstwaarden. Een besluit verwijst naar de laatste beschikbare beleids- en medische beoordeling op het moment van besluitvorming en naar de producerende taak. Deze beoordelingen behouden hun feiten, uitkomsten en regelversies; latere beoordelingen veranderen de verwijzingen van oudere besluiten niet.

Ten opzichte van het eerder aangeleverde wensdiagram zijn er deze concrete verschillen:

- Er is geen abstracte opgeslagen klasse `Beoordeling`; beleidsbeoordelingen en medische beoordelingen zijn afzonderlijke entiteiten met vergelijkbare herkomstvelden.
- Vertegenwoordiging en ondertekening staan als velden op `Aanvraag`; er is geen afzonderlijke `Vertegenwoordiging`-entiteit. De aanvrager is een `applicantId`, niet een aparte relatie naar een tweede `Persoon`.
- De voortgangsstatus staat op `Aanvraag` als `applicantStatus`. Operaton beheert de procesvolgorde en taken.
- Taken en documentmetadata zijn eigendom van andere diensten. De gestippelde relaties zijn verwijzingen via API's en identifiers, geen gedeelde database-relaties.

Bronnen: de OpenAPI-contracten voor case-, BAS-, assessment- en documentservice en hun Java-entiteiten. De assessment-service slaat de getypeerd gevalideerde beoordelings- en besluitrecords op met hun volledige payload en audit. Oude case-tabellen blijven beschikbaar voor idempotente historische migratie.
