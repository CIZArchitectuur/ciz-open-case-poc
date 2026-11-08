package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name="application_submission_outbox")
public class SubmissionEventEntity extends PanacheEntityBase {
    @Id @Column(name="event_id") public UUID eventId;
    @Column(name="case_id",nullable=false) public UUID caseId;
    @Column(name="application_id",nullable=false) public UUID applicationId;
    @Column(name="occurred_at",nullable=false) public Instant occurredAt;
    @Column(name="correlation_id",nullable=false,length=100) public String correlationId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name="document_ids",nullable=false,columnDefinition="jsonb") public List<UUID> documentIds;
    @Column(name="published_at") public Instant publishedAt;
    @Column(name="event_type",nullable=false,length=30) public String eventType="ApplicationSubmitted";
    @Column(name="trace_parent",length=100) public String traceParent;
}
