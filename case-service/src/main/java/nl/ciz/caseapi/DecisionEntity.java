package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "decisions")
public class DecisionEntity extends PanacheEntityBase {
    @Id @Column(name = "decision_id", nullable = false) public UUID decisionId;
    @Column(name = "case_id", nullable = false) public UUID caseId;
    @Column(nullable = false, length = 40) public String result;
    @Column(nullable = false, length = 4000) public String motivation;
    @Column(length = 100) public String zorgprofiel;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb")
    public List<String> grondslagen;
    @Column(name = "decided_at", nullable = false) public Instant decidedAt;
    @Column(name = "sent_at") public Instant sentAt;
    @Column(name = "source_task_id") public UUID sourceTaskId;
    @Column(name = "policy_evaluation_id") public UUID policyEvaluationId;
    @Column(name = "medical_assessment_id") public UUID medicalAssessmentId;
}
