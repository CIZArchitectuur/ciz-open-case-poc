package nl.ciz.policy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

final class CizAanvraagCorpus {
    static final String ROOT_LAW = "corpus/aanvraag-eerst/regulation/nl/wet/"
            + "algemene_wet_bestuursrecht/2024-08-01.yaml";
    private static final List<String> LAW_PATHS = List.of(
            ROOT_LAW,
            "corpus/aanvraag-eerst/regulation/nl/wet/wet_langdurige_zorg/2024-07-01.yaml",
            "corpus/aanvraag-eerst/regulation/nl/uitvoeringsbeleid/ciz_aanwijzing_handtekening/2025-10-01.yaml",
            "corpus/aanvraag-eerst/regulation/nl/uitvoeringsbeleid/ciz_aanwijzing_verzekerden/2023-10-01.yaml",
            "corpus/aanvraag-eerst/regulation/nl/uitvoeringsbeleid/ciz_benodigde_informatie/2025-07-01.yaml",
            "corpus/aanvraag-eerst/regulation/nl/uitvoeringsbeleid/ciz_definitie_complete_aanvraag/2024-10-01.yaml",
            "corpus/aanvraag-eerst/regulation/nl/uitvoeringsbeleid/ciz_ter_zake_kundige/2026-02-23.yaml");

    private final Map<String, String> laws;
    private final List<Field> fields;
    private final String policyVersion;

    CizAanvraagCorpus() {
        laws = new LinkedHashMap<>();
        for (var path : LAW_PATHS) laws.put(path, readResource(path));
        fields = fieldsFrom(laws.values());
        policyVersion = manifestValue("sourceCommit");
    }

    String rootLaw() { return laws.get(ROOT_LAW); }

    List<String> extraLaws() {
        return LAW_PATHS.stream().filter(path -> !ROOT_LAW.equals(path)).map(laws::get).toList();
    }

    List<Field> fields() { return fields; }

    String policyVersion() { return policyVersion; }

    private static List<Field> fieldsFrom(Iterable<String> laws) {
        var fields = new LinkedHashMap<String, Field>();
        var yaml = new Yaml(new SafeConstructor(new LoaderOptions()));
        for (var law : laws) {
            var document = asMap(yaml.load(law));
            for (var article : asList(document.get("articles"))) {
                var machineReadable = asMap(asMap(article).get("machine_readable"));
                var execution = asMap(machineReadable.get("execution"));
                for (var parameter : asList(execution.get("parameters"))) {
                    addField(fields, asMap(parameter));
                }
                for (var input : asList(execution.get("input"))) {
                    var value = asMap(input);
                    if (asMap(value.get("source")).isEmpty()) addField(fields, value);
                }
            }
        }
        return fields.values().stream().sorted(Comparator.comparing(Field::factId)).toList();
    }

    private static void addField(Map<String, Field> fields, Map<String, Object> value) {
        var factId = string(value.get("name"));
        if (factId.isBlank()) return;
        var type = string(value.get("type"));
        var required = Boolean.TRUE.equals(value.get("required"));
        var description = string(value.get("description"));
        fields.merge(factId, new Field(factId, type, required, description),
                (current, added) -> new Field(current.factId(), current.type(),
                        current.required() || added.required(),
                        current.description().isBlank() ? added.description() : current.description()));
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
            if (stream == null) throw new IllegalStateException("Officieel CIZ-corpus ontbreekt");
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new PolicyEvaluationException(exception);
        }
    }

    private static String manifestValue(String name) {
        var manifest = readResource("corpus/aanvraag-eerst-manifest.yaml");
        return manifest.lines().filter(line -> line.startsWith(name + ":"))
                .findFirst().map(line -> line.substring(name.length() + 1).trim()).orElseThrow();
    }

    record Field(String factId, String type, boolean required, String description) {}
}
