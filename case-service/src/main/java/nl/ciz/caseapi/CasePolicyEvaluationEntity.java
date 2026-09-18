package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "case_policy_evaluations")
public class CasePolicyEvaluationEntity extends PanacheEntityBase {
    @Id
    @Column(name = "evaluation_id", nullable = false)
    public UUID evaluationId;
    @Column(name = "case_id", nullable = false)
    public UUID caseId;
    @Column(name = "task_id", nullable = false)
    public UUID taskId;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "facts", nullable = false, columnDefinition = "jsonb")
    public Map<String, Object> facts;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "outputs", nullable = false, columnDefinition = "jsonb")
    public Map<String, Object> outputs;
    @Column(name = "policy_version", nullable = false)
    public String policyVersion;
    @Column(name = "can_be_taken_into_consideration", nullable = false)
    public boolean canBeTakenIntoConsideration;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "resolved_inputs", nullable = false, columnDefinition = "jsonb")
    public Map<String, Object> resolvedInputs;
    @Column(name = "engine_version", nullable = false)
    public String engineVersion;
    @Column(name = "schema_version", nullable = false)
    public String schemaVersion;
    @Column(name = "regulation_hash", nullable = false)
    public String regulationHash;
    @Column(name = "effective_date", nullable = false)
    public LocalDate effectiveDate;
    @Column(name = "evaluated_at", nullable = false)
    public Instant evaluatedAt;
}
