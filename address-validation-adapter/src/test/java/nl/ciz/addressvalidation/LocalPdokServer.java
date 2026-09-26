package nl.ciz.addressvalidation;

import com.sun.net.httpserver.HttpServer;
import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public class LocalPdokServer implements QuarkusTestResourceLifecycleManager {
    static volatile String lastQuery;
    static final AtomicInteger callCount = new AtomicInteger();
    private HttpServer server;

    @Override
    public Map<String, String> start() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/free", exchange -> {
                var query = exchange.getRequestURI().getRawQuery();
                lastQuery = query;
                callCount.incrementAndGet();
                var decodedQuery = query == null ? "" : URLDecoder.decode(query, StandardCharsets.UTF_8);
                var isFailure = decodedQuery.contains("9999ZZ");
                var isNoMatch = decodedQuery.contains("1234ZZ");
                var response = isFailure
                        ? "provider failure"
                        : isNoMatch
                                ? "{\"response\":{\"docs\":[]}}"
                                : "{\"response\":{\"docs\":[{\"postcode\":\"3514AR\",\"huis_nlt\":\"38-BS\",\"straatnaam\":\"Bemuurde Weerd O.Z.\",\"woonplaatsnaam\":\"Utrecht\"}]}}";
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(isFailure ? 503 : 200, response.getBytes(StandardCharsets.UTF_8).length);
                try (var body = exchange.getResponseBody()) {
                    body.write(response.getBytes(StandardCharsets.UTF_8));
                }
            });
            server.start();
            return Map.of("PDOK_BASE_URL", "http://127.0.0.1:" + server.getAddress().getPort() + "/free");
        } catch (IOException exception) {
            throw new IllegalStateException("Could not start local PDOK test server", exception);
        }
    }

    @Override
    public void stop() {
        if (server != null) server.stop(0);
    }
}
