package nl.ciz.documentstructuring;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.Response;
import java.io.File;
import java.util.Map;
import nl.ciz.documentstructuring.generated.api.JobsApi;
import nl.ciz.documentstructuring.generated.model.StructuringResult;
import org.apache.camel.ProducerTemplate;

@ApplicationScoped
public class StructuringResource implements JobsApi {
    private final ProducerTemplate producer;
    public StructuringResource(ProducerTemplate producer) { this.producer = producer; }
    public Response startStructuring(File body,String correlationId,String traceparent,String tracestate) {
        return Response.accepted(call("direct:structure-submit",body,headers(correlationId,traceparent,tracestate))).build();
    }
    public Response getStructuring(String jobId,String correlationId,String traceparent,String tracestate) {
        return Response.ok(call("direct:structure-poll",jobId,headers(correlationId,traceparent,tracestate))).build();
    }
    private StructuringResult call(String route,Object body,Map<String,Object> headers) {
        try {return producer.requestBodyAndHeaders(route,body,headers,StructuringResult.class);}
        catch(Exception failure) {
            int status=503;
            for(Throwable cause=failure;cause!=null;cause=cause.getCause())
                if(cause instanceof jakarta.ws.rs.WebApplicationException web) status=web.getResponse().getStatus();
            throw new jakarta.ws.rs.WebApplicationException("Document processing unavailable or invalid input",status);
        }
    }
    private Map<String,Object> headers(String correlationId,String traceparent,String tracestate) {
        var output=new java.util.HashMap<String,Object>();
        if(correlationId!=null) output.put("X-Correlation-ID",correlationId);
        if(traceparent!=null) output.put("traceparent",traceparent);
        if(tracestate!=null) output.put("tracestate",tracestate);
        return output;
    }
}
