package nl.ciz.impairmentanalysis;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.Response;
import nl.ciz.impairmentanalysis.generated.api.AnalysisApi;
import nl.ciz.impairmentanalysis.generated.model.AnalysisInput;
import nl.ciz.impairmentanalysis.generated.model.AnalysisOutput;
import org.apache.camel.ProducerTemplate;

@ApplicationScoped
public class AnalysisResource implements AnalysisApi {
    @jakarta.ws.rs.core.Context jakarta.ws.rs.core.HttpHeaders headers;
    private final ProducerTemplate producer;
    public AnalysisResource(ProducerTemplate producer) { this.producer=producer; }
    public Response analyseDossier(AnalysisInput body, String xCorrelationId, String traceparent, String tracestate) {
        var propagated=new java.util.HashMap<String,Object>();
        for(var key:new String[]{"traceparent","tracestate","X-Correlation-ID"}) {
            var value=headers.getHeaderString(key);
            if(value!=null) propagated.put(key,value);
        }
        try { return Response.ok(producer.requestBodyAndHeaders("direct:impairment-analysis",body,propagated,AnalysisOutput.class)).build(); }
        catch(Exception failure) { throw new jakarta.ws.rs.WebApplicationException("Dossieranalyse niet beschikbaar of bronverwijzingen ongeldig.",503); }
    }
}
