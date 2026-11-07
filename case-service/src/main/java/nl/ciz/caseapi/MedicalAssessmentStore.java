package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import nl.ciz.caseapi.generated.policy.model.MedicalAssessmentEvaluation;

@ApplicationScoped
public class MedicalAssessmentStore {
    @jakarta.inject.Inject AssessmentGateway assessments;
    @Transactional
    public void persist(UUID caseId, UUID taskId, Map<String, Object> facts,
            MedicalAssessmentEvaluation evaluation, LocalDate effectiveDate, Instant assessedAt) {
        var entity = new CaseMedicalAssessmentEntity();
        entity.assessmentId = UUID.randomUUID();
        entity.caseId = caseId;
        entity.taskId = taskId;
        entity.facts = Map.copyOf(facts);
        entity.outputs = Map.copyOf(evaluation.getOutputs());
        entity.resolvedInputs = evaluation.getResolvedInputs() == null ? Map.of() : Map.copyOf(evaluation.getResolvedInputs());
        entity.assessmentComplete = evaluation.getAssessmentComplete();
        entity.criteriaMet = evaluation.getCriteriaMet();
        entity.medicalAdviceRequired = evaluation.getMedicalAdviceRequired();
        entity.policyVersion = evaluation.getPolicyVersion();
        entity.engineVersion = evaluation.getEngineVersion();
        entity.schemaVersion = evaluation.getSchemaVersion();
        entity.regulationHash = evaluation.getRegulationHash();
        entity.effectiveDate = effectiveDate;
        entity.assessedAt = assessedAt;
        DomainCalls.call(()->{assessments.api().saveMedicalAssessment(caseId, assessments.transport(entity,
                nl.ciz.caseapi.generated.assessment.model.MedicalAssessment.class));return null;});
    }

    public List<Map<String, Object>> list(UUID caseId) {
        assessments.migrate(caseId);
        return DomainCalls.call(()->assessments.api().listMedicalAssessments(caseId)).stream()
                .map(value -> assessments.mapper().convertValue(value, new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){})).toList();
    }

}
