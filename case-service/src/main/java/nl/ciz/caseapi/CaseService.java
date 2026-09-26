package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.io.File;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import nl.ciz.caseapi.generated.model.CaseDocument;
import nl.ciz.caseapi.generated.model.CaseTask;
import nl.ciz.caseapi.generated.model.CreateCaseRequest;
import nl.ciz.caseapi.generated.model.ModelCase;
import nl.ciz.caseapi.generated.model.Person;
import nl.ciz.caseapi.generated.model.Address;
import nl.ciz.caseapi.generated.model.CaseStatus;
import nl.ciz.caseapi.generated.model.Application;
import nl.ciz.caseapi.generated.model.TaskCompletionRequest;
import nl.ciz.caseapi.generated.model.ApplicantSupplementRequest;
import nl.ciz.caseapi.generated.operaton.model.VariableValue;

@ApplicationScoped
public class CaseService {
    private final Clock clock = Clock.systemUTC();
    private final OperatonWorkflowGateway workflow;
    private final DocumentGateway documents;
    private final PolicyGateway policy;
    private final PolicyEvaluationStore policyEvaluations;
    private final MedicalAssessmentStore medicalAssessments;
    private final StatusEventOutbox statusEvents;

    public CaseService(OperatonWorkflowGateway workflow, DocumentGateway documents, PolicyGateway policy,
            PolicyEvaluationStore policyEvaluations, MedicalAssessmentStore medicalAssessments,
            StatusEventOutbox statusEvents) {
        this.workflow = workflow;
        this.documents = documents;
        this.policy = policy;
        this.policyEvaluations = policyEvaluations;
        this.medicalAssessments = medicalAssessments;
        this.statusEvents = statusEvents;
    }

    @Transactional
    public ModelCase create(CreateCaseRequest request) {
        var person = PersonEntity.<PersonEntity>find("citizenServiceNumber", request.getCitizenServiceNumber().trim())
                .firstResultOptional().orElseGet(() -> {
                    var created = new PersonEntity();
                    created.personId = UUID.randomUUID();
                    created.citizenServiceNumber = request.getCitizenServiceNumber().trim();
                    created.clientName = request.getClientName().trim();
                    created.lastName = request.getLastName().trim();
                    created.initials = request.getInitials().trim();
                    created.birthDate = request.getBirthDate();
                    created.persistAndFlush();
                    return created;
                });
        if (!person.birthDate.equals(request.getBirthDate())) {
            throw new PersonDataConflictException();
        }
        var address = new AddressEntity();
        address.addressId = UUID.randomUUID();
        address.personId = person.personId;
        address.street = request.getStreet().trim();
        address.houseNumber = request.getHouseNumber().trim();
        address.postalCode = request.getPostalCode().trim();
        address.city = request.getCity().trim();
        address.country = request.getCountry().trim();
        address.persistAndFlush();

        var entity = new CaseEntity();
        entity.caseId = UUID.randomUUID();
        entity.personId = person.personId;
        entity.addressId = address.addressId;
        entity.createdAt = now();
        entity.persistAndFlush();

        var application = new ApplicationEntity();
        application.applicationId = UUID.randomUUID();
        application.caseId = entity.caseId;
        application.applicantId = request.getApplicantId().trim();
        application.permanentCareNeed = request.getPermanentCareNeed();
        application.permanentSupervision = request.getPermanentSupervision();
        application.applicantRole = request.getApplicantRole().toString();
        application.signedBy = request.getSignedBy().toString();
        application.authorizationSignedByClient = request.getAuthorizationSignedByClient();
        application.submittedAt = entity.createdAt;
        application.applicantStatus = "WAITING_FOR_REGISTRATION";
        application.statusUpdatedAt = entity.createdAt;
        application.persistAndFlush();
        workflow.startForCase(entity.caseId);
        return toModel(entity);
    }

    public Optional<ModelCase> find(UUID caseId) {
        return CaseEntity.<CaseEntity>findByIdOptional(caseId).map(CaseService::toModel);
    }

    public Optional<CaseStatus> status(UUID caseId) {
        if (CaseEntity.findById(caseId) == null) return Optional.empty();
        var application = ApplicationEntity.<ApplicationEntity>find("caseId", caseId).firstResult();
        return Optional.of(new CaseStatus().caseId(caseId)
                .status(CaseStatus.StatusEnum.fromValue(application.applicantStatus))
                .updatedAt(offset(application.statusUpdatedAt)));
    }

    public Optional<List<ModelCase>> listPersonCases(UUID personId) {
        if (PersonEntity.findById(personId) == null) return Optional.empty();
        return Optional.of(CaseEntity.<CaseEntity>list("personId = ?1 order by createdAt desc", personId)
                .stream().map(CaseService::toModel).toList());
    }

    public CaseDocument addDocument(UUID caseId, String fileName, String contentType, File body) {
        requireCase(caseId);
        return documents.upload(caseId, fileName, contentType, body);
    }

    public List<CaseDocument> listDocuments(UUID caseId) {
        requireCase(caseId);
        return documents.list(caseId);
    }

    public CaseDocumentContent downloadDocument(UUID caseId, UUID documentId) {
        requireCase(caseId);
        return documents.download(caseId, documentId);
    }

    public List<CaseTask> listTasks(UUID caseId) {
        requireCase(caseId);
        return workflow.listTasks(caseId);
    }

    public List<CaseTask> listTasks(String status, String type) {
        return workflow.listTasks(status, type).stream()
                .filter(task -> CaseEntity.findById(task.getCaseId()) != null)
                .toList();
    }

    public CaseTask getTask(UUID taskId) {
        return workflow.getTask(taskId);
    }

    @Transactional
    public CaseTask provideApplicantSupplement(UUID caseId, ApplicantSupplementRequest request, String correlationId) {
        requireCase(caseId);
        if (request == null || request.getSupplementText() == null || request.getSupplementText().isBlank()) {
            throw new InvalidTaskCompletionException();
        }
        var task = workflow.listTasks(caseId).stream()
                .filter(candidate -> candidate.getType() == CaseTask.TypeEnum.SUPPLEMENT_PROVISION)
                .filter(candidate -> candidate.getStatus() == CaseTask.StatusEnum.OPEN)
                .findFirst().orElseThrow(InvalidTaskCompletionException::new);
        return completeTask(task.getTaskId(), new TaskCompletionRequest().supplementText(request.getSupplementText()), correlationId);
    }

    @Transactional
    public CaseTask completeTask(UUID taskId, TaskCompletionRequest request, String correlationId) {
        var task = workflow.getTask(taskId);
        if (task.getStatus() == CaseTask.StatusEnum.COMPLETED) {
            return workflow.completeTask(taskId, Map.of());
        }
        if (request == null) throw new InvalidTaskCompletionException();
        var variables = new LinkedHashMap<String, VariableValue>();
        var application = ApplicationEntity.<ApplicationEntity>find("caseId", task.getCaseId()).firstResultOptional()
                .orElseThrow(() -> new CaseNotFoundException(task.getCaseId()));

        switch (task.getType()) {
            case REGISTRATION_ACCEPTANCE -> {
                if (request.getFacts() == null || request.getRegistrationOutcome() == null) {
                    throw new InvalidTaskCompletionException();
                }
                var effectiveDate = request.getEffectiveDate() == null ? LocalDate.now(clock) : request.getEffectiveDate();
                var facts = withApplicantFacts(task.getCaseId(), request.getFacts());
                var evaluation = policy.evaluate(facts, effectiveDate);
                policyEvaluations.persist(task.getCaseId(), taskId, facts, evaluation, effectiveDate, now());
                var outcome = request.getRegistrationOutcome().toString();
                if ("NOT_TAKEN_INTO_CONSIDERATION".equals(outcome)) {
                    saveDecision(application, outcome, request.getDecisionMotivation());
                }
                variables.put("registrationOutcome", textVariable(outcome));
            }
            case REQUEST_ADDITIONAL_INFORMATION -> {
                var text = requiredText(request.getSupplementText());
                application.supplementRequest = text;
                application.supplementResponse = null;
                application.supplementRequestedAt = now();
                application.supplementRespondedAt = null;
                application.persist();
            }
            case SUPPLEMENT_PROVISION -> {
                var text = requiredText(request.getSupplementText());
                if (application.supplementRequest == null || application.supplementRespondedAt != null) {
                    throw new InvalidTaskCompletionException();
                }
                application.supplementResponse = text;
                application.supplementRespondedAt = now();
                application.persist();
            }
            case TRIAGE -> {
                if (request.getTriageOutcome() == null) throw new InvalidTaskCompletionException();
                var outcome = request.getTriageOutcome().toString();
                if ("DIRECT_HANDLED".equals(outcome)) {
                    saveDecision(application, requiredDecision(request), request.getDecisionMotivation());
                } else if ("NOT_TAKEN_INTO_CONSIDERATION".equals(outcome)) {
                    saveDecision(application, "NOT_TAKEN_INTO_CONSIDERATION", request.getDecisionMotivation());
                }
                variables.put("triageOutcome", textVariable(outcome));
            }
            case WLZ_INVESTIGATION_DECISION -> {
                if (request.getFacts() == null) throw new InvalidTaskCompletionException();
                var result = requiredDecision(request);
                if ("NOT_TAKEN_INTO_CONSIDERATION".equals(result)) throw new InvalidTaskCompletionException();
                var motivation = requiredText(request.getDecisionMotivation());
                var effectiveDate = request.getEffectiveDate() == null ? LocalDate.now(clock) : request.getEffectiveDate();
                var evaluation = policy.evaluateMedicalAssessment(request.getFacts(), effectiveDate);
                if (!evaluation.getAssessmentComplete()) throw new InvalidTaskCompletionException();
                medicalAssessments.persist(task.getCaseId(), taskId, request.getFacts(), evaluation, effectiveDate, now());
                saveDecision(application, result, motivation);
            }
            case OUTGOING_COMMUNICATION -> {
                if (application.decisionResult == null) throw new InvalidTaskCompletionException();
                application.decisionSentAt = now();
                application.persist();
            }
        }
        var completed = workflow.completeTask(taskId, variables);
        var nextStatus = applicantStatusAfter(task, request);
        if (nextStatus != null) {
            var eventTime = now();
            var safeCorrelationId = correlationId == null || correlationId.isBlank()
                    ? UUID.randomUUID().toString() : correlationId.substring(0, Math.min(100, correlationId.length()));
            statusEvents.recordIfChanged(task.getCaseId(), application.applicantStatus, nextStatus,
                    eventTime, safeCorrelationId);
        }
        return completed;
    }

    private static String applicantStatusAfter(CaseTask task, TaskCompletionRequest request) {
        return switch (task.getType()) {
            case REGISTRATION_ACCEPTANCE -> switch (request.getRegistrationOutcome()) {
                case ACCEPTED -> "WAITING_FOR_TRIAGE";
                case REQUEST_ADDITIONAL_INFORMATION -> "WAITING_FOR_DOCUMENTS";
                case NOT_TAKEN_INTO_CONSIDERATION -> "DECISION_PENDING";
            };
            case REQUEST_ADDITIONAL_INFORMATION -> "WAITING_FOR_DOCUMENTS";
            case SUPPLEMENT_PROVISION -> "WAITING_FOR_REGISTRATION";
            case TRIAGE -> switch (request.getTriageOutcome()) {
                case FURTHER_INVESTIGATION -> "WAITING_FOR_ASSESSMENT";
                case DIRECT_HANDLED, NOT_TAKEN_INTO_CONSIDERATION -> "DECISION_PENDING";
            };
            case WLZ_INVESTIGATION_DECISION -> "DECISION_PENDING";
            case OUTGOING_COMMUNICATION -> "DECISION_SENT";
        };
    }

    public Object intakeForm(UUID taskId) {
        var task = workflow.getTask(taskId);
        if (task.getType() != CaseTask.TypeEnum.REGISTRATION_ACCEPTANCE) {
            throw new InvalidTaskCompletionException();
        }
        return policy.intakeForm();
    }

    public Object medicalAssessmentForm(UUID taskId) {
        var task = workflow.getTask(taskId);
        if (task.getType() != CaseTask.TypeEnum.WLZ_INVESTIGATION_DECISION) throw new InvalidTaskCompletionException();
        return policy.medicalAssessmentForm();
    }

    public List<Map<String, Object>> policyEvaluations(UUID caseId) {
        requireCase(caseId);
        return policyEvaluations.list(caseId);
    }

    public List<Map<String, Object>> medicalAssessments(UUID caseId) {
        requireCase(caseId);
        return medicalAssessments.list(caseId);
    }

    private static void requireCase(UUID caseId) {
        if (CaseEntity.findById(caseId) == null) {
            throw new CaseNotFoundException(caseId);
        }
    }

    private static Map<String, Object> withApplicantFacts(UUID caseId, Map<String, Object> suppliedFacts) {
        var entity = CaseEntity.<CaseEntity>findByIdOptional(caseId).orElseThrow(() -> new CaseNotFoundException(caseId));
        var person = (PersonEntity) PersonEntity.findById(entity.personId);
        var address = (AddressEntity) AddressEntity.findById(entity.addressId);
        var facts = new LinkedHashMap<String, Object>(suppliedFacts);
        putPresence(facts, "achternaam_aanwezig", person.lastName);
        putPresence(facts, "voorletters_aanwezig", person.initials);
        putPresence(facts, "bsn_aanwezig", person.citizenServiceNumber);
        if (person.birthDate != null) facts.put("geboortedatum_aanwezig", true);
        putPresence(facts, "straat_aanwezig", address.street);
        putPresence(facts, "huisnummer_aanwezig", address.houseNumber);
        putPresence(facts, "postcode_aanwezig", address.postalCode);
        putPresence(facts, "woonplaats_aanwezig", address.city);
        putPresence(facts, "land_aanwezig", address.country);
        facts.put("dagtekening_aanvraag_aanwezig", true);
        facts.put("gewenste_zorg_aanwezig", true);
        return facts;
    }

    private static void putPresence(Map<String, Object> facts, String factId, String value) {
        if (value != null && !value.isBlank()) facts.put(factId, true);
    }

    private static VariableValue textVariable(String value) {
        return new VariableValue().value(value).type("String");
    }

    private static String requiredText(String value) {
        if (value == null || value.isBlank() || value.length() > 4000) {
            throw new InvalidTaskCompletionException();
        }
        return value.trim();
    }

    private static String requiredDecision(TaskCompletionRequest request) {
        if (request.getDecisionResult() == null) throw new InvalidTaskCompletionException();
        return request.getDecisionResult().toString();
    }

    private void saveDecision(ApplicationEntity application, String result, String motivation) {
        application.decisionResult = result;
        application.decisionMotivation = requiredText(motivation);
        application.decisionMadeAt = now();
        application.decisionSentAt = null;
        application.persist();
    }

    private Instant now() {
        return Instant.now(clock).truncatedTo(ChronoUnit.MICROS);
    }

    private static ModelCase toModel(CaseEntity entity) {
        var person = (PersonEntity) PersonEntity.findById(entity.personId);
        var address = (AddressEntity) AddressEntity.findById(entity.addressId);
        var application = ApplicationEntity.<ApplicationEntity>find("caseId", entity.caseId).firstResult();
        return new ModelCase()
                .caseId(entity.caseId)
                .personId(entity.personId)
                .addressId(entity.addressId)
                .applicationId(application.applicationId)
                .createdAt(entity.createdAt.atOffset(ZoneOffset.UTC))
                .person(new Person()
                        .personId(person.personId).clientName(person.clientName).lastName(person.lastName)
                        .initials(person.initials).citizenServiceNumber(person.citizenServiceNumber)
                        .birthDate(person.birthDate))
                .address(new Address()
                        .addressId(address.addressId).personId(address.personId).street(address.street)
                        .houseNumber(address.houseNumber).postalCode(address.postalCode)
                        .city(address.city).country(address.country))
                .application(new Application()
                        .applicationId(application.applicationId).caseId(application.caseId)
                        .applicantId(application.applicantId).permanentCareNeed(application.permanentCareNeed)
                        .permanentSupervision(application.permanentSupervision)
                        .applicantRole(Application.ApplicantRoleEnum.fromValue(application.applicantRole))
                        .signedBy(Application.SignedByEnum.fromValue(application.signedBy))
                        .authorizationSignedByClient(application.authorizationSignedByClient)
                        .submittedAt(application.submittedAt.atOffset(ZoneOffset.UTC))
                        .applicantStatus(Application.ApplicantStatusEnum.fromValue(application.applicantStatus))
                        .statusUpdatedAt(offset(application.statusUpdatedAt))
                        .supplementRequest(application.supplementRequest)
                        .supplementResponse(application.supplementResponse)
                        .supplementRequestedAt(offset(application.supplementRequestedAt))
                        .supplementRespondedAt(offset(application.supplementRespondedAt))
                        .decisionResult(application.decisionResult == null ? null
                                : Application.DecisionResultEnum.fromValue(application.decisionResult))
                        .decisionMotivation(application.decisionMotivation)
                        .decisionMadeAt(offset(application.decisionMadeAt))
                        .decisionSentAt(offset(application.decisionSentAt)));
    }

    private static java.time.OffsetDateTime offset(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }

}
