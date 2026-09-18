package nl.ciz.policy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

final class StandalonePolicyDocument {
    private final String source;
    private final String version;
    private final List<CizAanvraagCorpus.Field> fields;

    StandalonePolicyDocument(String resource) {
        source = readResource(resource);
        version = sha256(source);
        fields = fieldsFrom(source);
    }

    String source() { return source; }
    String version() { return version; }
    List<CizAanvraagCorpus.Field> fields() { return fields; }

    private static List<CizAanvraagCorpus.Field> fieldsFrom(String source) {
        var yaml = new Yaml(new SafeConstructor(new LoaderOptions()));
        var document = asMap(yaml.load(source));
        var fields = new ArrayList<CizAanvraagCorpus.Field>();
        for (var article : asList(document.get("articles"))) {
            var execution = asMap(asMap(asMap(article).get("machine_readable")).get("execution"));
            for (var parameter : asList(execution.get("parameters"))) {
                var value = asMap(parameter);
                fields.add(new CizAanvraagCorpus.Field(
                        string(value.get("name")), string(value.get("type")),
                        Boolean.TRUE.equals(value.get("required")), string(value.get("description"))));
            }
        }
        return List.copyOf(fields);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> asList(Object value) {
        return value instanceof List<?> list ? (List<Object>) list : List.of();
    }

    private static String string(Object value) { return value == null ? "" : value.toString(); }

    private static String readResource(String path) {
        try (var stream = Thread.currentThread().getContextClassLoader().getResourceAsStream(path)) {
            if (stream == null) throw new IllegalStateException("RegelRecht policy ontbreekt: " + path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new PolicyEvaluationException(exception);
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
