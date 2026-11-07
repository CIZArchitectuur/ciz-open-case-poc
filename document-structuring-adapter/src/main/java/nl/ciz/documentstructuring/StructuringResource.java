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
    @jakarta.ws.rs.core.Context jakarta.ws.rs.core.HttpHeaders requestHeaders;
    private final ProducerTemplate producer;
    public StructuringResource(ProducerTemplate producer) { this.producer = producer; }
    public Response startStructuring(File body) {
        return Response.accepted(call("direct:structure-submit",body)).build();
    }
    public Response getStructuring(String jobId) {
        return Response.ok(call("direct:structure-poll",jobId)).build();
    }
    private StructuringResult call(String route,Object body) {
        try {return producer.requestBodyAndHeaders(route,body,headers(),StructuringResult.class);}
        catch(Exception failure) {
            int status=503;
            for(Throwable cause=failure;cause!=null;cause=cause.getCause())
                if(cause instanceof jakarta.ws.rs.WebApplicationException web) status=web.getResponse().getStatus();
            throw new jakarta.ws.rs.WebApplicationException("Document processing unavailable or invalid input",status);
        }
    }
    private Map<String,Object> headers() {
        var output=new java.util.HashMap<String,Object>();
        for(var key:new String[]{"traceparent","tracestate","X-Correlation-ID"}) {
            var value=requestHeaders.getHeaderString(key);
            if(value!=null) output.put(key,value);
        }
        return output;
    }
}
