package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class ApplicationStatusProjection {
    private static final Set<String> STATUSES = Set.of(
            "WAITING_FOR_REGISTRATION", "WAITING_FOR_DOCUMENTS", "WAITING_FOR_TRIAGE",
            "WAITING_FOR_ASSESSMENT", "DECISION_PENDING", "DECISION_SENT");

    @Transactional
    public void apply(JsonNode event) {
        var caseId = UUID.fromString(requiredText(event, "caseId"));
        var status = requiredText(event, "status");
        var occurredAt = Instant.parse(requiredText(event, "occurredAt"));
        UUID.fromString(requiredText(event, "eventId"));
        requiredText(event, "correlationId");
        if (!STATUSES.contains(status)) throw new IllegalArgumentException("Unsupported applicant status");

        var application = ApplicationEntity.<ApplicationEntity>find("caseId", caseId).firstResultOptional()
                .orElseThrow(() -> new IllegalArgumentException("Status event references an unknown application"));
        if (application.statusUpdatedAt == null || occurredAt.isAfter(application.statusUpdatedAt)) {
            application.applicantStatus = status;
            application.statusUpdatedAt = occurredAt;
            application.persist();
        }
    }

    private static String requiredText(JsonNode event, String field) {
        var value = event.path(field);
        if (!value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException("Status event is missing a required field");
        }
        return value.asText();
    }
}
