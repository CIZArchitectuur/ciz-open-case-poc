package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import nl.ciz.caseapi.generated.policy.model.IntakeEvaluation;

@ApplicationScoped
public class PolicyEvaluationStore {
    @Transactional
    public void persist(UUID caseId, UUID taskId, Map<String, Object> facts, IntakeEvaluation evaluation,
            LocalDate effectiveDate, Instant evaluatedAt) {
        var entity = new CasePolicyEvaluationEntity();
        entity.evaluationId = UUID.randomUUID();
        entity.caseId = caseId;
        entity.taskId = taskId;
        entity.facts = Map.copyOf(facts);
        entity.outputs = Map.copyOf(evaluation.getOutputs());
        entity.canBeTakenIntoConsideration = evaluation.getCanBeTakenIntoConsideration();
        entity.resolvedInputs = evaluation.getResolvedInputs() == null
                ? Map.of() : Map.copyOf(evaluation.getResolvedInputs());
        entity.policyVersion = evaluation.getPolicyVersion();
        entity.engineVersion = evaluation.getEngineVersion();
        entity.schemaVersion = evaluation.getSchemaVersion();
        entity.regulationHash = evaluation.getRegulationHash();
        entity.effectiveDate = effectiveDate;
        entity.evaluatedAt = evaluatedAt;
        entity.persistAndFlush();
    }

    public List<Map<String, Object>> list(UUID caseId) {
        return CasePolicyEvaluationEntity.<CasePolicyEvaluationEntity>list("caseId = ?1 order by evaluatedAt", caseId).stream()
                .map(entity -> Map.<String, Object>ofEntries(
                        Map.entry("evaluationId", entity.evaluationId), Map.entry("caseId", entity.caseId),
                        Map.entry("taskId", entity.taskId), Map.entry("facts", entity.facts),
                        Map.entry("canBeTakenIntoConsideration", entity.canBeTakenIntoConsideration),
                        Map.entry("outputs", entity.outputs), Map.entry("resolvedInputs", entity.resolvedInputs),
                        Map.entry("policyVersion", entity.policyVersion), Map.entry("engineVersion", entity.engineVersion),
                        Map.entry("schemaVersion", entity.schemaVersion), Map.entry("regulationHash", entity.regulationHash),
                        Map.entry("effectiveDate", entity.effectiveDate),
                        Map.entry("evaluatedAt", entity.evaluatedAt.toString())))
                .toList();
    }
}
