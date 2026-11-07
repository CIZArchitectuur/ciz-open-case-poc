package nl.ciz.impairmentanalysis;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import nl.ciz.impairmentanalysis.generated.model.*;
import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class AnalysisRoutes extends RouteBuilder {
    @ConfigProperty(name="impairment.url") Optional<String> url;
    @ConfigProperty(name="impairment.token") Optional<String> token;
    @ConfigProperty(name="impairment.version") String version;
    @ConfigProperty(name="impairment.classifier") Optional<String> classifier;
    @ConfigProperty(name="impairment.mock") boolean mock;
    @ConfigProperty(name="impairment.timeout-ms") int timeout;
    private final ObjectMapper mapper=new ObjectMapper();
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public void configure() {
        errorHandler(noErrorHandler());
        from("direct:impairment-analysis").routeId("dossier-impairment-analysis").process(this::analyse);
    }
    private void analyse(Exchange e) throws Exception {
        var input=e.getIn().getBody(AnalysisInput.class);
        var docs=mapper.valueToTree(input).path("documents");
        if(!docs.isArray() || docs.isEmpty()) throw new IllegalArgumentException();
        if(mock) { e.getMessage().setBody(simulate(docs)); return; }
        // A configured model/checkpoint is an operational requirement; never claim
        // that a generic LLM call executed RobBERT.
        if(url.isEmpty() || token.isEmpty() || classifier.isEmpty() || !classifier.get().toLowerCase(Locale.ROOT).contains("robbert")
                || version.equals("unverified")) throw new IllegalStateException();
        var payload=mapper.createObjectNode();
        var upstreamDocs=payload.putArray("documents");
        var keys=new HashSet<String>();
        for(var doc:docs) {
            if(!keys.add(doc.path("docKey").asText()) || !doc.path("classificationUnits").isArray()) throw new IllegalArgumentException();
            var value=upstreamDocs.addObject();
            value.put("doc_key",doc.path("docKey").asText());
            value.set("classification_units",doc.path("classificationUnits"));
        }
        String boundary="ciz-"+UUID.randomUUID();
        String body="--"+boundary+"\r\nContent-Disposition: form-data; name=\"aanvraag_id\"\r\n\r\n"+input.getAnalysisNumber()+
            "\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"dossier.json\"\r\nContent-Type: application/json\r\n\r\n"+
            mapper.writeValueAsString(payload)+"\r\n--"+boundary+"--\r\n";
        var request=HttpRequest.newBuilder(URI.create(url.get().replaceAll("/$","")+"/process-file"))
            .timeout(Duration.ofMillis(timeout)).header("Content-Type","multipart/form-data; boundary="+boundary);
        token.ifPresent(value->request.header("Authorization","Bearer "+value));
        for(var key:new String[]{"traceparent","tracestate","X-Correlation-ID"}) {
            var value=e.getIn().getHeader(key,String.class); if(value!=null) request.header(key,value);
        }
        // No retries of this non-idempotent, potentially expensive operation.
        var response=http.send(request.POST(HttpRequest.BodyPublishers.ofString(body,StandardCharsets.UTF_8)).build(),HttpResponse.BodyHandlers.ofInputStream());
        try(var stream=response.body()) {
            if(response.statusCode()!=200) throw new IllegalStateException();
            var bytes=stream.readNBytes(5_000_001);
            if(bytes.length>5_000_000) throw new IllegalStateException();
            e.getMessage().setBody(normalize(mapper.readTree(bytes),docs));
        }
    }
    AnalysisOutput normalize(JsonNode response,JsonNode docs) {
        var aanvraag=response.path("Aanvraag");
        if(!aanvraag.isObject() || !aanvraag.path("Stoornissen").isArray()) throw new IllegalArgumentException();
        var output=new AnalysisOutput().mock(false).pipelineVersion(version).classifierModel(classifier.orElseThrow()).findings(new ArrayList<>()).sourceUnits(allSources(docs));
        if(response.path("clientbeeld").path("summary").isTextual()) output.setClientPicture(response.path("clientbeeld").path("summary").asText());
        // No grondslag is invented for care-profile calculation. Until the PoC
        // has an explicit confirmed upstream grondslag, ignore its default profile.
        if(aanvraag.path("Stoornissen").size()>100) throw new IllegalArgumentException();
        int i=0;
        for(var record:aanvraag.path("Stoornissen")) {
            var finding=new Finding().findingId("proposal-"+(++i)).domain(record.path("Stoornis").asText())
                .explanation(record.path("Uitleg").asText()).sources(new ArrayList<>());
            var score=record.path("Ernst");
            if(!score.isNull() && !score.isMissingNode()) {
                if(!score.isIntegralNumber() || score.asInt()<0 || score.asInt()>4) throw new IllegalArgumentException();
                finding.setScore(score.asInt());
            }
            if(finding.getDomain().isBlank()) throw new IllegalArgumentException();
            for(var sentence:record.path("Zinnen")) {
                String key=sentence.path("DocKey").asText();
                JsonNode doc=null;
                for(var candidate:docs) if(candidate.path("docKey").asText().equals(key)) doc=candidate;
                if(doc==null) throw new IllegalArgumentException("Unknown document source");
                String unitId=sentence.path("UnitId").asText();
                JsonNode unit=null;
                for(var candidate:doc.path("classificationUnits"))
                    if(candidate.path("unit_id").asText().equals(unitId)) unit=candidate;
                if(unit==null) throw new IllegalArgumentException("Unknown source unit");
                finding.getSources().add(source(doc,unit,sentence.path("Tekst").asText()));
            }
            if(finding.getSources().isEmpty()) throw new IllegalArgumentException("Missing evidence");
            output.getFindings().add(finding);
        }
        return output;
    }
    private Source source(JsonNode doc,JsonNode unit,String text) {
        var source=new Source().documentId(UUID.fromString(doc.path("documentId").asText()))
            .extractionId(UUID.fromString(doc.path("extractionId").asText())).docKey(doc.path("docKey").asText())
            .text(text).unitId(unit.path("unit_id").asText(null)).subdocumentId(unit.path("subdoc_id").asText(null))
            .pages(new ArrayList<>()).regionIds(new ArrayList<>());
        if(unit.path("pages").isArray()) for(var page:unit.path("pages")) source.getPages().add(page.asInt());
        else if(unit.path("page").isInt()) source.getPages().add(unit.path("page").asInt());
        for(var region:unit.path("region_ids")) source.getRegionIds().add(region.asInt());
        return source;
    }
    private List<Source> allSources(JsonNode docs) {
        var sources=new ArrayList<Source>();
        for(var doc:docs) for(var unit:doc.path("classificationUnits")) {
            String text=unit.path("text").asText();
            if(text.length()>20000) throw new IllegalArgumentException("Oversized source");
            sources.add(source(doc,unit,text));
            if(sources.size()>20000) throw new IllegalArgumentException();
        }
        return sources;
    }
    private AnalysisOutput simulate(JsonNode docs) {
        var output=new AnalysisOutput().mock(true).pipelineVersion("contract-simulation-v1").classifierModel("simulation-no-robbert")
            .clientPicture("Fictief cliëntbeeld voor een contracttest; niet uit documenten afgeleid.").findings(new ArrayList<>()).sourceUnits(allSources(docs));
        for(var doc:docs) {
            if(doc.path("classificationUnits").isEmpty()) continue;
            output.getFindings().add(new Finding().findingId("mock-"+output.getFindings().size()).domain("ADL")
                .score(2).explanation("SIMULATIE: voorbeeldscore, geen medische conclusie.")
                .sources(List.of(source(doc,doc.path("classificationUnits").get(0),"SIMULATIE: fictieve bronpassage."))));
        }
        return output;
    }
}
