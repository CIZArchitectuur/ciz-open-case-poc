package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smallrye.reactive.messaging.MutinyEmitter;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.eclipse.microprofile.reactive.messaging.Channel;
import org.jboss.logging.Logger;
import io.quarkus.scheduler.Scheduled;

@ApplicationScoped
public class StatusEventPublisher {
    private static final Logger LOG = Logger.getLogger(StatusEventPublisher.class);
    private final StatusEventOutbox outbox;
    private final ObjectMapper json;
    private final MutinyEmitter<String> emitter;

    public StatusEventPublisher(StatusEventOutbox outbox, ObjectMapper json,
            @Channel("application-status-events-out") MutinyEmitter<String> emitter) {
        this.outbox = outbox;
        this.json = json;
        this.emitter = emitter;
    }

    @Scheduled(every = "${STATUS_OUTBOX_POLL_INTERVAL:1s}", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void publishPending() {
        for (var event : outbox.pending()) {
            try {
                var payload = new LinkedHashMap<String, Object>();
                payload.put("eventId", event.eventId);
                payload.put("caseId", event.caseId);
                payload.put("status", event.applicantStatus);
                payload.put("occurredAt", event.occurredAt);
                payload.put("correlationId", event.correlationId);
                var serialized = json.writeValueAsString(payload);
                emitter.send(serialized).subscribe().asCompletionStage().toCompletableFuture().get(5, TimeUnit.SECONDS);
                outbox.markPublished(event.eventId, Instant.now());
            } catch (Exception failure) {
                // The outbox row remains pending and will be retried; deliberately omit payload and case data.
                LOG.warnf("Status event publication failed for event %s; it will be retried", event.eventId);
                break;
            }
        }
    }
}
