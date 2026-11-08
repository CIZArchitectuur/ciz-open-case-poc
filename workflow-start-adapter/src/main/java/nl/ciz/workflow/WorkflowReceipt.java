package nl.ciz.workflow;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="workflow_receipts")
public class WorkflowReceipt extends PanacheEntityBase {
    @Id @Column(name="case_id") public UUID caseId;
    @Column(name="event_id",nullable=false) public UUID eventId;
    @Column(name="correlation_id",nullable=false,length=100) public String correlationId;
    @Column(name="trace_parent",length=100) public String traceParent;
    @Column(name="completed_at") public Instant completedAt;
    @Column(name="next_attempt_at",nullable=false) public Instant nextAttemptAt;
    @Column(nullable=false) public int attempts;
}
