package nl.ciz.documentstructuring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.WebApplicationException;
import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.ArrayList;
import java.util.UUID;
import nl.ciz.documentstructuring.generated.model.StructuringResult;
import nl.ciz.documentstructuring.generated.model.ExtractedFragment;
import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

@ApplicationScoped
public class PipelineRoutes extends RouteBuilder {
    private static final Logger LOG = Logger.getLogger(PipelineRoutes.class);
    private static final int MAX_FRAGMENT_LENGTH = 10_000;
    private static final int MAX_RESULT_FRAGMENTS = 200;
    @ConfigProperty(name="pipeline.url") String url;
    @ConfigProperty(name="pipeline.version") String version;
    @ConfigProperty(name="pipeline.mock") boolean mock;
    @ConfigProperty(name="pipeline.config") String config;
    @ConfigProperty(name="pipeline.timeout-ms") int timeout;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    public void configure() {
        // No body logging and no automatic retry of non-idempotent pipeline submissions.
        errorHandler(noErrorHandler());
        from("direct:structure-submit").routeId("document-structure-submit").process(this::submit);
        from("direct:structure-poll").routeId("document-structure-poll").process(this::poll);
    }

    private JsonNode request(Exchange e, String path, HttpRequest.BodyPublisher body, String type) {
        try {
            var builder = HttpRequest.newBuilder(URI.create(url + path)).timeout(Duration.ofMillis(timeout));
            for (var name : new String[]{"traceparent", "tracestate", "X-Correlation-ID"}) {
                var value = e.getIn().getHeader(name, String.class);
                if (value != null) builder.header(name, value);
            }
            var req = body == null ? builder.GET() : builder.header("Content-Type", type).POST(body);
            var response = http.send(req.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (var stream = response.body()) {
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    var error = mapper.readTree(stream.readNBytes(32_768)).path("error").asText("");
                    var category = switch (error) {
                        case "Upload minimaal een PDF" -> "missing_pdf_part";
                        case "Geen geldige PDF bestanden geüpload" -> "invalid_pdf_filename";
                        case "Ongeldige pipeline_config payload" -> "invalid_pipeline_config";
                        case "Ongeldig aantal iteraties", "Aantal iteraties moet tussen 1 en 10 liggen" -> "invalid_repeats";
                        default -> "unclassified";
                    };
                    LOG.warnf("Document pipeline rejected request: status=%d category=%s", response.statusCode(), category);
                    throw new IllegalStateException();
                }
                var bytes = stream.readNBytes(5_000_001);
                if (bytes.length > 5_000_000) throw new IllegalStateException();
                return mapper.readTree(bytes);
            }
        } catch (Exception failure) {
            // Never expose the provider exception, response body, logs or sensitive paths.
            throw new WebApplicationException("Document processing service unavailable", 503);
        }
    }

    private StructuringResult result(String id, StructuringResult.StatusEnum status) {
        return new StructuringResult().jobId(id).status(status).providerVersion(version).mock(mock)
            .fragments(new ArrayList<>());
    }

    private void submit(Exchange e) throws Exception {
        File file = e.getIn().getBody(File.class);
        if (file == null || file.length() > 10_000_000) throw new WebApplicationException("Invalid PDF",400);
        var bytes = Files.readAllBytes(file.toPath());
        if (bytes.length < 5 || !new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-"))
            throw new WebApplicationException("Invalid PDF",400);
        String boundary = "ciz-" + UUID.randomUUID();
        String prefix = "--"+boundary+"\r\nContent-Disposition: form-data; name=\"pipeline_config\"\r\n\r\n"+config+
            "\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"pdfs\"; filename=\"document.pdf\"\r\nContent-Type: application/pdf\r\n\r\n";
        var response = request(e,"/api/process_pdfs",HttpRequest.BodyPublishers.concat(
            HttpRequest.BodyPublishers.ofByteArray(prefix.getBytes(StandardCharsets.UTF_8)),
            HttpRequest.BodyPublishers.ofByteArray(bytes),
            HttpRequest.BodyPublishers.ofByteArray(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8))),
            "multipart/form-data; boundary="+boundary);
        String id = response.path("job_id").asText();
        if (!id.matches("[a-zA-Z0-9_-]{1,100}")) throw new WebApplicationException("Invalid pipeline response",503);
        e.getMessage().setBody(result(id,StructuringResult.StatusEnum.PROCESSING));
    }

    private void poll(Exchange e) {
        String id = e.getIn().getBody(String.class);
        if (!id.matches("[a-zA-Z0-9_-]{1,100}")) throw new WebApplicationException("Invalid job",400);
        var snapshot = request(e,"/api/process_status/"+id,null,null);
        var output = result(id,StructuringResult.StatusEnum.PROCESSING);
        String status = snapshot.path("status").asText();
        if (java.util.Set.of("failed","error","cancelled","canceled").contains(status)) {
            output.setStatus(StructuringResult.StatusEnum.FAILED);
        } else if (java.util.Set.of("completed","done","success").contains(status)) {
            String run = snapshot.path("run_id").asText();
            if (!run.matches("[a-zA-Z0-9_-]{1,100}")) throw new WebApplicationException("Invalid run",503);
            output.setRunId(run);
            output.setModelId(snapshot.path("model_id").asText(null));
            var index = request(e,"/api/run/"+run+"/documents",null,null);
            // One uploaded PDF must map to exactly one document: never guess a source association.
            var documents = index.path("documents");
            if (!documents.isArray() || documents.size()!=1) throw new WebApplicationException("Ambiguous pipeline result",503);
            String key = documents.get(0).path("doc_key").asText();
            if (!key.matches("[a-zA-Z0-9_.-]{1,200}")) throw new WebApplicationException("Invalid document key",503);
            var sidecar = request(e,"/api/run/"+run+"/document/"+key+"/ocr",null,null);
            output.setDocKey(key);
            if (sidecar.path("classification_units").isArray()) {
                var units = new ArrayList<java.util.Map<String, Object>>();
                for (var unit : sidecar.path("classification_units"))
                    units.add(mapper.convertValue(unit, new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String,Object>>() {}));
                output.setClassificationUnits(units);
            }
            collect(sidecar.path("classification_units"),output);
            if (!output.getFragments().isEmpty()) {
                output.setStatus(StructuringResult.StatusEnum.READY);
                if (sidecar.path("errors").size()>0)
                    LOG.warnf("Document pipeline completed with diagnostics: count=%d fragments=%d; manual review remains required",
                        sidecar.path("errors").size(), output.getFragments().size());
            } else output.setStatus(StructuringResult.StatusEnum.FAILED);
        }
        e.getMessage().setBody(output);
    }

    private void collect(JsonNode units, StructuringResult output) {
        if (!units.isArray()) return;
        if(units.size()>200) throw new WebApplicationException("Too many OCR fragments; review in provider required",503);
        for (var unit : units) {
            String text=unit.path("text").asText("");
            if (text.isBlank()) continue;
            var pages=new ArrayList<Integer>();
            if(unit.path("pages").isArray()) for(var page:unit.path("pages")) {
                if(page.canConvertToInt() && page.asInt()>0) pages.add(page.asInt());
            }
            Integer page=unit.path("page").canConvertToInt() && unit.path("page").asInt()>0
                ? unit.path("page").asInt() : null;
            if(pages.isEmpty() && page!=null) pages.add(page);
            // Preserve long OCR output losslessly while respecting the contract's per-fragment limit.
            for(int start=0;start<text.length();start+=MAX_FRAGMENT_LENGTH) {
                if(output.getFragments().size()>=MAX_RESULT_FRAGMENTS)
                    throw new WebApplicationException("Too many OCR fragments; review in provider required",503);
                int end=Math.min(start+MAX_FRAGMENT_LENGTH,text.length());
                var fragment=new ExtractedFragment().text(text.substring(start,end));
                if(page!=null) fragment.setPage(page);
                fragment.setPages(new ArrayList<>(pages));
                if(unit.has("unit_id")) fragment.setUnitId(unit.path("unit_id").asText());
                if (unit.has("subdoc_id")) fragment.setSubdocumentId(unit.path("subdoc_id").asText());
                output.addFragmentsItem(fragment);
            }
        }
    }
}
