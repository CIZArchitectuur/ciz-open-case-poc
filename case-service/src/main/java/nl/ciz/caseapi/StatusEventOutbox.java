package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class StatusEventOutbox {
    @Transactional
    public void recordIfChanged(UUID caseId, String currentStatus, String status, Instant occurredAt,
            String correlationId) {
        var latestEvent = StatusEventEntity.<StatusEventEntity>find("caseId = ?1 order by occurredAt desc", caseId)
                .firstResultOptional().orElse(null);
        var effectiveStatus = latestEvent == null ? currentStatus : latestEvent.applicantStatus;
        if (status.equals(effectiveStatus)) return;
        var event = new StatusEventEntity();
        event.eventId = UUID.randomUUID();
        event.caseId = caseId;
        event.applicantStatus = status;
        event.occurredAt = occurredAt;
        event.correlationId = correlationId;
        event.persist();
    }

    @Transactional
    public List<StatusEventEntity> pending() {
        return StatusEventEntity.<StatusEventEntity>find("publishedAt is null order by occurredAt")
                .page(0, 25).list();
    }

    @Transactional
    public void markPublished(UUID eventId, Instant publishedAt) {
        StatusEventEntity.<StatusEventEntity>findByIdOptional(eventId).ifPresent(event -> {
            event.publishedAt = publishedAt;
            event.persist();
        });
    }
}
