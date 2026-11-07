package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smallrye.reactive.messaging.annotations.Blocking;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.*;
import org.eclipse.microprofile.reactive.messaging.Incoming;

@ApplicationScoped
public class SubmissionConsumer {
    @jakarta.inject.Inject ObjectMapper mapper;
    @Incoming("submissions") @Blocking @Transactional
    public void accept(String payload) throws Exception {
        accept(payload,false);
    }
    @Incoming("documents") @Blocking @Transactional
    public void received(String payload) throws Exception {
        accept(payload,true);
    }
    private void accept(String payload,boolean receipt) throws Exception {
        var event=mapper.readTree(payload);
        var id=UUID.fromString(event.required("eventId").asText());
        var caseId=UUID.fromString(event.required("caseId").asText());
        BasSubmissionEntity.lockCase(caseId);
        if(BasSubmissionEntity.findById(id)!=null) return;
        var row=new BasSubmissionEntity(); row.eventId=id; row.caseId=caseId;
        row.occurredAt=Instant.parse(event.required("occurredAt").asText());
        row.correlationId=event.required("correlationId").asText();
        var trace=event.path("traceparent").asText(null);
        if(trace!=null && trace.matches("00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}")) row.traceParent=trace;
        if(row.correlationId.isBlank() || row.correlationId.length()>100) throw new IllegalArgumentException("Invalid correlation identifier");
        row.documentIds=new ArrayList<>();
        if(receipt) {
            row.documentIds.add(UUID.fromString(event.required("documentId").asText()));
            row.components=List.of("METADATA","OCR");row.reason="DOCUMENT_RECEIVED";
        } else for(var doc:event.required("documentIds")) row.documentIds.add(UUID.fromString(doc.asText()));
        row.persist();
    }
}
