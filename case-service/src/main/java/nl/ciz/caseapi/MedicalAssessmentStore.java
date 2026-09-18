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
        entity.persistAndFlush();
    }

    public List<Map<String, Object>> list(UUID caseId) {
        return CaseMedicalAssessmentEntity.<CaseMedicalAssessmentEntity>list("caseId = ?1 order by assessedAt", caseId).stream()
                .map(entity -> Map.<String, Object>ofEntries(
                        Map.entry("assessmentId", entity.assessmentId), Map.entry("caseId", entity.caseId),
                        Map.entry("taskId", entity.taskId), Map.entry("facts", entity.facts),
                        Map.entry("assessmentComplete", entity.assessmentComplete),
                        Map.entry("criteriaMet", entity.criteriaMet),
                        Map.entry("medicalAdviceRequired", entity.medicalAdviceRequired),
                        Map.entry("outputs", entity.outputs), Map.entry("resolvedInputs", entity.resolvedInputs),
                        Map.entry("policyVersion", entity.policyVersion), Map.entry("engineVersion", entity.engineVersion),
                        Map.entry("schemaVersion", entity.schemaVersion), Map.entry("regulationHash", entity.regulationHash),
                        Map.entry("effectiveDate", entity.effectiveDate), Map.entry("assessedAt", entity.assessedAt.toString())))
                .toList();
    }
}
