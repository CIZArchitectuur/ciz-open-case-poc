package nl.ciz.workflow;

import jakarta.ws.rs.client.ClientRequestContext;
import jakarta.ws.rs.client.ClientRequestFilter;

public class CorrelationFilter implements ClientRequestFilter {
    @Override public void filter(ClientRequestContext request) {
        var correlation=org.jboss.logging.MDC.get("correlationId");
        if(correlation!=null) request.getHeaders().putSingle("X-Correlation-ID",correlation.toString());
    }
}
