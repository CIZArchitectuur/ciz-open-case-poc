package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smallrye.reactive.messaging.MutinyEmitter;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.eclipse.microprofile.reactive.messaging.Channel;

@ApplicationScoped
public class SubmissionEventPublisher {
    private final SubmissionEventOutbox outbox;
    private final ObjectMapper json;
    private final MutinyEmitter<String> emitter;
    private final MutinyEmitter<String> documents;
    public SubmissionEventPublisher(SubmissionEventOutbox outbox, ObjectMapper json,
            @Channel("application-submitted-out") MutinyEmitter<String> emitter,
            @Channel("document-received-out") MutinyEmitter<String> documents) {
        this.outbox=outbox; this.json=json; this.emitter=emitter; this.documents=documents;
    }
    @Scheduled(every="1s", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    void publish() {
        for(var event:outbox.pending()) {
            try {
                var payload=new java.util.LinkedHashMap<String,Object>();
                payload.put("eventId",event.eventId);payload.put("caseId",event.caseId);
                payload.put("occurredAt",event.occurredAt);payload.put("correlationId",event.correlationId);
                if(event.traceParent!=null) payload.put("traceparent",event.traceParent);
                boolean received="DocumentReceived".equals(event.eventType);
                if(received) payload.put("documentId",event.documentIds.get(0));
                else {payload.put("applicationId",event.applicationId);payload.put("documentIds",event.documentIds);}
                var metadata=io.smallrye.reactive.messaging.kafka.api.OutgoingKafkaRecordMetadata.<String>builder().withKey(event.caseId.toString()).build();
                (received?documents:emitter).sendMessage(org.eclipse.microprofile.reactive.messaging.Message.of(json.writeValueAsString(payload)).addMetadata(metadata))
                        .subscribe().asCompletionStage().toCompletableFuture().get(5,TimeUnit.SECONDS);
                outbox.published(event.eventId);
            } catch(Exception failure) {
                org.jboss.logging.Logger.getLogger(getClass()).warn("Submission event could not be published; retry scheduled");
                break;
            }
        }
    }
}
