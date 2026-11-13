package nl.ciz.documentstructuring;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.camel.impl.DefaultCamelContext;
import org.junit.jupiter.api.Test;
import nl.ciz.documentstructuring.generated.model.StructuringResult;
import static org.junit.jupiter.api.Assertions.*;

class PipelineRoutesTest {
    @Test void submitPollAndFailuresStayNormalized() throws Exception {
        var calls=new AtomicInteger();
        var longOcrText="x".repeat(10_001);
        var trace=Map.<String,Object>of("X-Correlation-ID","correlation-test",
            "traceparent","00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01","tracestate","test=state");
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/", exchange -> {
            String path=exchange.getRequestURI().getPath();
            if(!path.endsWith("/bad") && !path.endsWith("/error")) {
                trace.forEach((name,value)->assertEquals(value,exchange.getRequestHeaders().getFirst(name)));
            }
            String body;
            int status=200;
            if(path.equals("/api/process_pdfs")) {
                calls.incrementAndGet();
                var upload=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
                assertTrue(upload.contains("name=\"pdfs\""));
                assertTrue(upload.contains("filename=\"document.pdf\""));
                body="{\"job_id\":\"job1\"}";
            } else if(path.contains("/process_status/bad")) {
                body="sensitive upstream error"; status=500;
            } else if(path.contains("/process_status/error")) {
                body="{\"status\":\"failed\",\"error\":\"sensitive upstream error\"}";
            } else if(path.contains("/process_status")) {
                body="{\"status\":\"completed\",\"run_id\":\"run1\",\"model_id\":\"test\",\"logs\":[\"private\"]}";
            } else if(path.endsWith("/documents")) {
                body="{\"documents\":[{\"doc_key\":\"doc\"}]}";
            } else {
                body="{\"classification_units\":[{\"text\":\""+longOcrText+"\",\"page\":2,\"subdoc_id\":1}],\"errors\":[\"non-fatal test diagnostic\"]}";
            }
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status,bytes.length);
            exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        var pdf=Files.createTempFile("fictional",".pdf");
        Files.writeString(pdf,"%PDF-1.4\n%%EOF");
        try(var context=new DefaultCamelContext()) {
            var route=new PipelineRoutes();
            route.url="http://127.0.0.1:"+server.getAddress().getPort();
            route.timeout=1000; route.version="test"; route.mock=true; route.config="{}";
            context.addRoutes(route); context.start();
            var producer=context.createProducerTemplate();
            var start=producer.requestBodyAndHeaders("direct:structure-submit",pdf.toFile(),
                trace,StructuringResult.class);
            assertEquals("job1",start.getJobId()); assertEquals(1,calls.get());
            var result=producer.requestBodyAndHeaders("direct:structure-poll","job1",trace,StructuringResult.class);
            assertEquals(StructuringResult.StatusEnum.READY,result.getStatus());
            assertEquals(2,result.getFragments().size());
            assertEquals(longOcrText.length(),result.getFragments().stream().mapToInt(fragment->fragment.getText().length()).sum());
            assertTrue(result.getFragments().stream().allMatch(fragment->fragment.getText().length()<=10_000));
            assertTrue(result.getFragments().stream().allMatch(fragment->fragment.getPage()==2));
            assertEquals(StructuringResult.StatusEnum.FAILED,
                producer.requestBody("direct:structure-poll","error",StructuringResult.class).getStatus());
            var failure=assertThrows(Exception.class,()->producer.requestBody("direct:structure-poll","bad"));
            assertFalse(failure.toString().contains("sensitive upstream error"));
            assertThrows(Exception.class,()->producer.requestBody("direct:structure-poll","../unsafe"));
        } finally {server.stop(0); Files.deleteIfExists(pdf);}
    }
}
