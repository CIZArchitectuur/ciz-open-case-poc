package nl.ciz.workflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smallrye.reactive.messaging.annotations.Blocking;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.UUID;
import org.eclipse.microprofile.reactive.messaging.Incoming;

@ApplicationScoped
public class SubmissionConsumer {
    @Inject ObjectMapper json;
    @Inject EntityManager db;

    // Acknowledge only after a durable local receipt. Supplements never restart a case.
    @Incoming("submissions") @Blocking @Transactional
    public void receive(String payload) throws Exception {
        var event=json.readTree(payload);
        var caseId=UUID.fromString(event.required("caseId").asText());
        var eventId=UUID.fromString(event.required("eventId").asText());
        UUID.fromString(event.required("applicationId").asText());
        var correlation=event.required("correlationId").asText();
        if(correlation.isBlank() || correlation.length()>100) throw new IllegalArgumentException("Invalid correlation identifier");
        var trace=event.path("traceparent").asText(null);
        if(trace!=null && !trace.matches("00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}")) trace=null;
        db.createNativeQuery("INSERT INTO workflow_receipts(case_id,event_id,correlation_id,trace_parent) VALUES (?1,?2,?3,?4) ON CONFLICT(case_id) DO NOTHING")
            .setParameter(1,caseId).setParameter(2,eventId).setParameter(3,correlation).setParameter(4,trace).executeUpdate();
    }
}
