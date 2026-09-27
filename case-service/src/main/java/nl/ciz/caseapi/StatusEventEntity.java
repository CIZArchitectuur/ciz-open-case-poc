package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "application_status_outbox")
public class StatusEventEntity extends PanacheEntityBase {
    @Id
    @Column(name = "event_id", nullable = false)
    public UUID eventId;

    @Column(name = "case_id", nullable = false)
    public UUID caseId;

    @Column(name = "applicant_status", nullable = false, length = 40)
    public String applicantStatus;

    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    @Column(name = "correlation_id", nullable = false, length = 100)
    public String correlationId;

    @Column(name = "published_at")
    public Instant publishedAt;
}
