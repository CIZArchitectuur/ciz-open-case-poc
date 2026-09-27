package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smallrye.common.annotation.Blocking;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.reactive.messaging.Incoming;

@ApplicationScoped
public class ApplicationStatusEventConsumer {
    private final ObjectMapper json;
    private final ApplicationStatusProjection projection;

    public ApplicationStatusEventConsumer(ObjectMapper json, ApplicationStatusProjection projection) {
        this.json = json;
        this.projection = projection;
    }

    @Incoming("application-status-events-in")
    @Blocking
    public void receive(String payload) throws Exception {
        projection.apply(json.readTree(payload));
    }
}
