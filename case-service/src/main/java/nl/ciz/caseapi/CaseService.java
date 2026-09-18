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
import nl.ciz.caseapi.generated.model.TaskCompletionRequest;
import nl.ciz.caseapi.generated.operaton.model.VariableValue;

@ApplicationScoped
public class CaseService {
    private final Clock clock = Clock.systemUTC();
    private final OperatonWorkflowGateway workflow;
    private final DocumentGateway documents;
    private final PolicyGateway policy;
    private final PolicyEvaluationStore policyEvaluations;
    private final MedicalAssessmentStore medicalAssessments;

    public CaseService(OperatonWorkflowGateway workflow, DocumentGateway documents, PolicyGateway policy,
            PolicyEvaluationStore policyEvaluations, MedicalAssessmentStore medicalAssessments) {
        this.workflow = workflow;
        this.documents = documents;
        this.policy = policy;
        this.policyEvaluations = policyEvaluations;
        this.medicalAssessments = medicalAssessments;
    }

    @Transactional
    public ModelCase create(CreateCaseRequest request) {
        var entity = new CaseEntity();
        entity.caseId = UUID.randomUUID();
        entity.applicantId = request.getApplicantId().trim();
        entity.clientName = request.getClientName().trim();
        entity.lastName = request.getLastName().trim();
        entity.initials = request.getInitials().trim();
        entity.citizenServiceNumber = request.getCitizenServiceNumber().trim();
        entity.birthDate = request.getBirthDate();
        entity.street = request.getStreet().trim();
        entity.houseNumber = request.getHouseNumber().trim();
        entity.postalCode = request.getPostalCode().trim();
        entity.city = request.getCity().trim();
        entity.country = request.getCountry().trim();
        entity.permanentCareNeed = request.getPermanentCareNeed();
        entity.permanentSupervision = request.getPermanentSupervision();
        entity.createdAt = now();
        entity.persistAndFlush();
        workflow.startForCase(entity.caseId);
        return toModel(entity);
    }

    public Optional<ModelCase> find(UUID caseId) {
        return CaseEntity.<CaseEntity>findByIdOptional(caseId).map(CaseService::toModel);
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

    public CaseTask completeTask(UUID taskId, TaskCompletionRequest request) {
        var task = workflow.getTask(taskId);
        var variables = java.util.Map.<String, VariableValue>of();
        if (task.getType() == CaseTask.TypeEnum.APPLICATION_INTAKE
                || task.getType() == CaseTask.TypeEnum.ADDITIONAL_INFORMATION) {
            if (task.getStatus() == CaseTask.StatusEnum.COMPLETED) {
                return workflow.completeTask(taskId, variables);
            }
            if (request == null || request.getFacts() == null) {
                throw new InvalidTaskCompletionException();
            }
            var effectiveDate = request.getEffectiveDate() == null ? LocalDate.now(clock) : request.getEffectiveDate();
            var facts = withApplicantFacts(task.getCaseId(), request.getFacts());
            var evaluation = policy.evaluate(facts, effectiveDate);
            policyEvaluations.persist(task.getCaseId(), taskId, facts, evaluation, effectiveDate, now());
            variables = java.util.Map.of("applicationComplete", new VariableValue()
                    .value(evaluation.getCanBeTakenIntoConsideration()).type("Boolean"));
        } else if (task.getType() == CaseTask.TypeEnum.APPLICATION_REVIEW) {
            if (task.getStatus() == CaseTask.StatusEnum.COMPLETED) return workflow.completeTask(taskId, variables);
            if (request == null || request.getFacts() == null) throw new InvalidTaskCompletionException();
            var effectiveDate = request.getEffectiveDate() == null ? LocalDate.now(clock) : request.getEffectiveDate();
            var evaluation = policy.evaluateMedicalAssessment(request.getFacts(), effectiveDate);
            if (!evaluation.getAssessmentComplete()) throw new InvalidTaskCompletionException();
            medicalAssessments.persist(task.getCaseId(), taskId, request.getFacts(), evaluation, effectiveDate, now());
            variables = java.util.Map.of("medicalCriteriaMet", new VariableValue()
                    .value(evaluation.getCriteriaMet()).type("Boolean"));
        }
        return workflow.completeTask(taskId, variables);
    }

    public Object intakeForm(UUID taskId) {
        var task = workflow.getTask(taskId);
        if (task.getType() != CaseTask.TypeEnum.APPLICATION_INTAKE
                && task.getType() != CaseTask.TypeEnum.ADDITIONAL_INFORMATION) {
            throw new InvalidTaskCompletionException();
        }
        return policy.intakeForm();
    }

    public Object medicalAssessmentForm(UUID taskId) {
        var task = workflow.getTask(taskId);
        if (task.getType() != CaseTask.TypeEnum.APPLICATION_REVIEW) throw new InvalidTaskCompletionException();
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
        var facts = new LinkedHashMap<String, Object>(suppliedFacts);
        putPresence(facts, "achternaam_aanwezig", entity.lastName);
        putPresence(facts, "voorletters_aanwezig", entity.initials);
        putPresence(facts, "bsn_aanwezig", entity.citizenServiceNumber);
        if (entity.birthDate != null) facts.put("geboortedatum_aanwezig", true);
        putPresence(facts, "straat_aanwezig", entity.street);
        putPresence(facts, "huisnummer_aanwezig", entity.houseNumber);
        putPresence(facts, "postcode_aanwezig", entity.postalCode);
        putPresence(facts, "woonplaats_aanwezig", entity.city);
        putPresence(facts, "land_aanwezig", entity.country);
        return facts;
    }

    private static void putPresence(Map<String, Object> facts, String factId, String value) {
        if (value != null && !value.isBlank()) facts.put(factId, true);
    }

    private Instant now() {
        return Instant.now(clock).truncatedTo(ChronoUnit.MICROS);
    }

    private static ModelCase toModel(CaseEntity entity) {
        return new ModelCase(entity.applicantId, entity.clientName, entity.lastName, entity.initials,
                entity.citizenServiceNumber, entity.birthDate, entity.street, entity.houseNumber,
                entity.postalCode, entity.city, entity.country, entity.permanentCareNeed,
                entity.permanentSupervision, entity.caseId,
                entity.createdAt.atOffset(ZoneOffset.UTC));
    }

}
